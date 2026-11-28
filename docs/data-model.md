# Data model and privacy rules

This is the database behind accounts, shared trips, places and photos. It runs on Supabase
(Postgres) in the Canada region, `ca-central-1`. Switching it on is a short checklist for the
owner: [accounts-setup.md](accounts-setup.md).

- Tables and rules: `supabase/migrations/`
- Tests for the rules: `supabase/tests/`
- Run them: `npm run test:db` (needs a Postgres you can reach with `psql`; no Docker needed)
- They run on every pull request against a stand-in for Supabase (the `privacy` job in
  `.github/workflows/check.yml`), and against a real local Supabase whenever the database or
  sign-in code changes (`.github/workflows/accounts.yml`, which also signs people in through
  the real sign-in service, `tests/e2e/backend.e2e.mjs`, and logs a trip together through the
  same calls the phones make, photo files included, `tests/e2e/triplog.e2e.mjs`)

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
| Leaving takes your part with you | Your photos and notes are deleted, your name comes off the stops, the places stay. Your suggestions and "I wasn't there" marks go too | `30_travellers`, `95_trip_log` |
| Any traveller can add to the trip log | Every traveller can log a stop. A stop is changed or removed only by whoever logged it; once they leave the trip it belongs to the whole group | `95_trip_log` |
| Anyone can propose corrections | A suggestion goes in `trip_stop_corrections`. Only the person who logged the stop accepts or turns it down, through `answer_stop_correction()` (once they have left the trip, anyone on it can) | `95_trip_log` |
| Anyone on the trip can say "we've left" | `close_stop()` sets the leaving time of a stop that is still open, for any traveller; the first time sent stands | `95_trip_log` |
| You can say you were not there | One row in `trip_stop_absences`, yours alone to add or take back. Viewers never see it | `95_trip_log` |
| Viewers see the story, not the workings | `trip_log()` hands a viewer the stops and the photos nobody hid. Suggestions and "I wasn't there" are for travellers only | `95_trip_log` |
| The person who runs the app has no back door | Admins can read the place review queue and nothing of private trips | `10_accounts_required`, `50_places` |
| Email is never shown | Email stays in Supabase's sign-in tables; no app table has an email column, and the data download leaves it out | `60_profiles_friends`, `90_blocks_reports_leaving` |
| Joining is by invite only | Supabase asks `private.before_user_created` before it makes any sign-in account. It says yes only to the owner's email or to someone holding a valid invite link; everyone else is told it is invite-only, and no email is sent | `80_joining`, e2e |
| An invite link works once, for 14 days | Only a hash of the link's code is stored. Using it makes you friends with whoever sent it | `80_joining` |
| You choose who your friends are | A friend request needs you to know the person already (you share a trip, or they asked you). New people arrive through invite links | `60_profiles_friends` |
| No passwords | Signing in is by emailed code only. A trigger on Supabase's `auth.users` blanks any password, so nobody can put one on an address before its owner confirms it, and password sign-in never works | `80_joining`, `70_structure`, e2e |
| Blocking is quiet and complete | A block ends the friendship, and nothing the person blocked sends reaches you. They are never told: a friend request they send waits as if unanswered, and an invite link from you looks expired, as a link you stopped does. Trips you share stay | `90_blocks_reports_leaving` |
| Reports reach the person who runs the app, and nothing more | The admin sees who reported whom and why, never the trips | `90_blocks_reports_leaving` |
| Leaving is quick to start and slow to finish | You vanish from friends at once. Everything is deleted after 30 days unless you sign in and come back; once you have asked, "delete now" is there too | `90_blocks_reports_leaving` |
| Your data is yours to take | `export_my_data()` returns everything the database holds that you made, and nobody else's notes | `90_blocks_reports_leaving` |
| Names are plain text | Names, home city, one line and travel style refuse control characters and hidden direction marks. So do stop notes (line breaks allowed), photo captions, suggestion reasons and the names of places members add | `80_joining`, `95_trip_log` |
| Nobody can flood anyone | At most 10 open invite links and 20 a day, 30 friend requests waiting, 20 reports a day, 3,000 stops on a trip, 50 open suggestions per person on a trip | `80_joining`, `90_blocks_reports_leaving`, `95_trip_log` |
| Members are 16 or over | Joining asks for an age band, `16-17` or `18+` | `80_joining` |

`70_structure` also guards whatever is added later: it fails the pull request if a new table
has row level security off, if the signed-out role can reach anything, or if a view or function
could sidestep the rules.

## Tables

**Accounts**

- `profiles`: name, picture, home city, one line. Seen by you, your friends, people who share
  a trip with you, and someone you have sent a friend request to. A profile exists only once a
  sign-in account has joined: signing in alone makes no profile.
- `account_private`: age band, travel style, app preferences, and the date your account will
  be deleted if you have asked to leave. Seen only by you.
- `friendships`: a request and its acceptance. One link per pair.
- `friend_invites`: invite links you made, who used each and when. The code itself is never
  stored, only its hash, which nobody can read through the API.
- `blocks`: who you blocked. Seen only by you.
- `reports`: reports you sent and whether they were closed. The admin reads them through
  `admin_reports()`.
- `app_admins`: who runs the app. Not reachable through the API.
- `private.settings`: the owner's email, which may always join. Not reachable through the API.

**Trips**

- `trips`: title, dates, cover photo, and `log_version`, a counter that goes up whenever
  anything in the trip's log changes (see `trip_log()` below).
- `trip_travellers`: who is on the trip, `invited` or `active`.
- `trip_traveller_settings`: each traveller's own sharing choice and their vote to delete.
  Kept apart so viewers can see who travelled without seeing who chose what.
- `trip_traveller_approvals`: travellers agreeing to add an invited person.
- `trip_viewers` and `trip_viewer_approvals`: who has been proposed as a viewer, and which
  travellers have agreed.
- `trip_private_links`: links only travellers see, such as the full album in Google Photos or
  iCloud.
- `trip_stops`: a place on a day, who logged it, the arrival and leaving times, whether those
  times are a guess (`est`, for stops caught up afterwards), and a note. Times are clock times
  at the place (`time`, with no time zone): 09:30 in Kyoto is stored as 09:30.
- `trip_stop_corrections`: a traveller's suggested change to someone else's stop (another
  place, day or times, or "remove it"), with a short reason, and whether it was accepted or
  turned down.
- `trip_stop_absences`: "I wasn't there", one row per traveller per stop.

**Places**, in one table with a `kind`:

- `guide`: a place in the Tandem Roads guide. Uses the same id as `data/cities` (for example
  `tokyo-sensoji`) and is written only by the server: the Connect accounts workflow copies every
  guide place in (`scripts/supabase/guide-places.mjs`), and again after any change to
  `data/cities`. Rows are added or updated, never removed.
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
- Removing a stop keeps the photos on it (they stay on the trip with no stop), so one person
  tidying the log never deletes someone else's photos.

## How the app talks to it

Reads and most writes are plain table calls; row level security decides what comes back.
These go through functions because they touch several rows at once, or must never show more
than their answer:

| Function | What it does |
| --- | --- |
| `finish_sign_in(invite, name, age_band)` | Called after every sign-in. Makes you a member if you came with a valid invite (or are the owner), uses the invite, and says what happened: `member`, `created`, `admin`, `invite` (`ok`, `own`, `used`, `already_friends`, `expired`, `unknown`), `friend` and `leaving` |
| `create_friend_invite(note)` | Makes an invite link code. Shown once; only its hash is kept |
| `cancel_friend_invite(invite_id)` | Stops one of your unused links |
| `my_people()` | Your friends, requests both ways, and the people you blocked, in one list |
| `request_account_deletion()` | Starts leaving and returns the date everything goes |
| `cancel_account_deletion()` | Comes back |
| `delete_account_now()` | Deletes at once, but only after you have asked to leave |
| `export_my_data()` | Everything the database holds that you made |
| `admin_reports(status)`, `admin_close_report(report_id, note)` | The admin's report queue |
| `create_trip(title, starts_on, ends_on)` | Starts a trip with the caller as its first traveller |
| `my_trip_invites()` | Invites waiting for the caller, with the trip title and who asked |
| `accept_trip_invite(trip_id)` | Joins, once every traveller has approved |
| `my_trips()` | The trips you travel on: title, dates, log version and how many travellers |
| `trip_log(trip_id, version)` | The whole log of one trip in one answer: travellers, stops, the members' places they use, photos (with who hid them, for travellers), open and recent suggestions, and "I wasn't there" marks. Pass the version you already have and an unchanged log comes back as `{version, same: true}`. Nothing at all for someone who may not see the trip |
| `trip_needs()` | What is waiting for you: trip invites (and whether they can be accepted yet), people waiting for your yes to travel or to view, and suggestions on stops you logged |
| `close_stop(stop_id, left_at)` | "We've left": sets the leaving time of a stop still open, for any traveller. Returns false if someone already did |
| `answer_stop_correction(id, accept)` | The person who logged the stop accepts or turns down a suggestion. Returns `accepted`, `removed` or `declined` |
| `submit_place_for_review(place_id)` | Sends one of your places to the review queue |
| `admin_review_place(place_id, approve, guide_place_id, note)` | The admin's answer |

Signing in, step by step: the app asks Supabase for a code (`POST /auth/v1/otp`), passing any
invite code in `data.invite` so the sign-up hook can check it; the person types the six-digit
code from the email (`POST /auth/v1/verify`, `type: email`); then the app calls
`finish_sign_in()` with the same invite code. A daily job (`private.housekeeping()`, 03:17 UTC)
deletes accounts whose 30 days are over and sign-in accounts that never joined after 7 days.

Common moves as table calls:

- Invite a traveller: insert into `trip_travellers` with `status = 'invited'`. Other travellers
  approve by inserting into `trip_traveller_approvals`.
- Propose a viewer: insert into `trip_viewers`. Other travellers approve by inserting into
  `trip_viewer_approvals`.
- Change your sharing choice: update your row in `trip_traveller_settings`.
- Leave a trip, or turn down an invite: delete your row in `trip_travellers`.
- Vote to delete a trip: set `agrees_delete` on your settings row.
- Hide a photo: insert into `photo_hides`. Show it again: delete your row.
- Log a stop: insert into `trip_stops` with an id the phone made, through
  `?on_conflict=id` with `Prefer: resolution=ignore-duplicates`, so sending it again after a
  lost answer changes nothing. Change or remove your own stops as usual.
- Suggest a change to someone else's stop: insert into `trip_stop_corrections`. Take it back:
  delete it while it is still open.
- Say you were not at a stop: insert into `trip_stop_absences`. Take it back: delete it.
- Add a photo: upload its file to `trip-photos/<trip_id>/<photo_id>.jpg` first, then insert the
  `photos` row with the same id. A file whose row never arrives is removed by the sweep.

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
- **Dates are UTC.** A trip is "over" from 00:00 UTC on the day after `ends_on`. Stop days and
  times are the exception: they are the date and clock at the place, as the phone there read
  them.
- **Ask for the log with your version.** `trip_log(trip, version)` costs a few bytes when
  nothing changed, so a phone can ask often. The counter covers everything the answer holds,
  including a member's place being renamed and a traveller joining or leaving.
- **Deleting a photo row does not delete its file.** The app removes both when someone deletes
  their own photo. Everything else (leaving a trip, leaving Tandem Roads, a deleted trip, a file
  whose row never arrived) is caught by a daily sweep, `scripts/supabase/sweep-photos.mjs`, run by
  `.github/workflows/sweep-photos.yml`, which removes files more than a day old that no photo row
  points at.
- **Someone leaving is invisible, not gone.** For 30 days their rows stay, their invite links
  stop working, and friends no longer see them. Their trips are untouched until the account is
  finally deleted, when "leaving takes your part with you" applies.
- **A block never shows.** The person blocked can still do what they could before, and it looks
  the same to them: a request waits as if unanswered, an invite link looks expired. Keep it that
  way in new screens: never refuse with an error that only a block could cause.

## Not in this pass

Comments, hearts, "want to go", polls, bookings and costs. Each needs its own tables with row
level security and tests in the same style.

## The live project

[accounts-setup.md](accounts-setup.md) is the owner's checklist. The **Connect accounts**
workflow then applies the migrations, sets the sign-in choices, records the owner's email (the
owner becomes the first admin on first sign-in), copies the guide's places into `places`, and
writes the project's address and publishable key to `data/backend.json`. It runs again by itself
when a merged change touches the migrations, the sign-in settings or `data/cities`. The photo
sweep runs every day and does nothing until accounts are set up. The `service_role` and secret keys are never used by the app
and never stored in the repository.
