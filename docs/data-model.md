# Data model and privacy rules

This is the database behind accounts, shared trips, places and photos. It is designed for
Supabase (Postgres) in the Canada region, `ca-central-1`. Nothing in the app uses it yet: the
tables and the tests for the privacy rules come first, and features are built on top.

- Tables and rules: `supabase/migrations/`
- Tests for the rules: `supabase/tests/`
- Run them: `npm run test:db` (needs a Postgres you can reach with `psql`; no Docker needed)
- They also run on every pull request (the `privacy` job in `.github/workflows/check.yml`)

## The rules, and where each is enforced

| Rule | How the database enforces it | Tested in |
| --- | --- | --- |
| Accounts are required | The signed-out role has no rights on any table or function | `10_accounts_required`, `70_structure` |
| No public links | The sharing choice has three values and none is public. Viewers are named accounts | `10_accounts_required` |
| A trip starts travellers-only | New travellers get the choice `travellers` | `20_trip_sharing`, `30_travellers` |
| The most private choice wins | Each traveller has their own row in `trip_traveller_settings`; the trip uses the most private one | `20_trip_sharing` |
| Widening needs all, narrowing needs one | You can only change your own row, so the trip widens only when the last person widens and narrows when anyone narrows | `20_trip_sharing` |
| Every traveller approves each viewer | A viewer counts only with a row in `trip_viewer_approvals` from every current traveller. Anyone can take theirs back | `20_trip_sharing` |
| Viewers see a trip after it ends, unless all agree to live | `viewers_after` opens the trip once `ends_on` has passed; before that every traveller must be on `viewers_live` | `20_trip_sharing` |
| Any traveller can hide a photo | A photo with any row in `photo_hides` is not sent to viewers, and neither is its file. Only the person who hid it can undo that | `40_photos` |
| No single owner | `trips` has no owner column. Joining needs every traveller's approval, nobody can remove anyone else, and deleting the trip needs everyone | `30_travellers` |
| Leaving takes your part with you | Your photos and notes are deleted, your name comes off the stops, the places stay | `30_travellers` |
| The person who runs the app has no back door | Admins can read the place review queue and nothing of private trips | `10_accounts_required`, `50_places` |
| Email is never shown | Email stays in Supabase's sign-in tables; no app table has an email column | `60_profiles_friends` |

`70_structure` also guards whatever is added later: it fails the pull request if a new table
has row level security off, if the signed-out role can reach anything, or if a view or function
could sidestep the rules.

## Tables

**Accounts**

- `profiles`: name, picture, home city, one line. Seen by you, your friends, and people who
  share a trip with you.
- `account_private`: age band. Seen only by you.
- `friendships`: a request and its acceptance. One link per pair.
- `app_admins`: who runs the app. Not reachable through the API.

**Trips**

- `trips`: title, dates, cover photo.
- `trip_travellers`: who is on the trip, `invited` or `active`.
- `trip_traveller_settings`: each traveller's own sharing choice and their vote to delete.
  Kept apart so viewers can see who travelled without seeing who chose what.
- `trip_traveller_approvals`: travellers agreeing to add an invited person.
- `trip_viewers` and `trip_viewer_approvals`: who has been proposed as a viewer, and which
  travellers have agreed.
- `trip_private_links`: links only travellers see, such as the full album in Google Photos or
  iCloud.
- `trip_stops`: a place on a day, with times and a note.

**Places**, in one table with a `kind`:

- `guide`: a place in the Tandem Roads guide. Uses the same id as `data/cities` (for example
  `tokyo-sensoji`) and is written only by the server.
- `private`: added by a member. Seen by its maker, and by whoever can see a trip that stops
  there.
- `submitted`: a member's place sent for review with `submit_place_for_review()`. The admin
  sees it in the queue (`kind = 'submitted' and review_status = 'pending'`) and answers with
  `admin_review_place()`. Approved: it can point at the guide place it became (`promoted_to`).
  Turned down: it goes back to `private` and stays on the member's trips.

**Photos**

- `photos`: a picked highlight on a trip, optionally on a stop. No location is stored.
- `photo_hides`: one row per traveller hiding a photo from viewers.
- Files sit in the private bucket `trip-photos` at `<trip_id>/<photo_id>.<ext>`, with the same
  rules as the `photos` row.

## How the app talks to it

Reads and most writes are plain table calls; row level security decides what comes back.
Five things go through functions because they touch several rows at once:

| Function | What it does |
| --- | --- |
| `create_trip(title, starts_on, ends_on)` | Starts a trip with the caller as its first traveller |
| `my_trip_invites()` | Invites waiting for the caller, with the trip title and who asked |
| `accept_trip_invite(trip_id)` | Joins, once every traveller has approved |
| `submit_place_for_review(place_id)` | Sends one of your places to the review queue |
| `admin_review_place(place_id, approve, guide_place_id, note)` | The admin's answer |

Common moves as table calls:

- Invite a traveller: insert into `trip_travellers` with `status = 'invited'`. Other travellers
  approve by inserting into `trip_traveller_approvals`.
- Propose a viewer: insert into `trip_viewers`. Other travellers approve by inserting into
  `trip_viewer_approvals`.
- Change your sharing choice: update your row in `trip_traveller_settings`.
- Leave a trip, or turn down an invite: delete your row in `trip_travellers`.
- Vote to delete a trip: set `agrees_delete` on your settings row.
- Hide a photo: insert into `photo_hides`. Show it again: delete your row.

## Things to know before building on it

- **A new traveller pauses viewers.** They join on `travellers` and have approved nobody, so
  the join screen should ask "this trip is shared with Maya and Leo, is that OK?" straight away.
- **Blocked changes are silent.** An update or delete that the rules block changes 0 rows
  rather than raising an error. Check the row count.
- **Invites and viewers must be friends** of the traveller who adds them.
- **A proposed viewer is not told** until every traveller has approved and the trip is open to
  viewers, so a "no" from one traveller is never visible to them.
- **Trip end dates.** A trip that has not ended cannot be given an end date in the past,
  because that would open it to viewers on one person's say. A traveller can still shorten a
  trip to end today; the others can answer by narrowing their own choice.
- **Dates are UTC.** A trip is "over" from 00:00 UTC on the day after `ends_on`.
- **Deleting a photo row does not delete its file.** The upload code must remove both, and a
  scheduled sweep should clear files with no row.

## Not in this pass

Comments, hearts, "want to go", polls, bookings and costs, blocking, reports, how members find
each other to become friends, and the script that copies guide places from `data/cities` into
`places`. Each needs its own tables with row level security and tests in the same style.

## When the Supabase project exists

1. Create the project in **Canada (Central)**, `ca-central-1`. The region cannot be changed later.
2. Apply `supabase/migrations/` (`supabase db push`).
3. Run the tests once against a local Supabase (`supabase start`), skipping
   `supabase/tests/setup/00_supabase_stand_in.sql`, which only exists to imitate Supabase.
   Until then the tests run against that imitation, so the real sign-in and file-storage tables
   have not been exercised.
4. Add the first admin by hand in the SQL editor: `insert into app_admins values ('<account id>')`.
5. Turn off the Data API for anything not needed, and never put the `service_role` key in the app.
