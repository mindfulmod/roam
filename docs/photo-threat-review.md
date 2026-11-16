# Threat review: private photos

Reviewed 2026-11-15, before any photo feature is built. It covers how a photo that the group
meant to keep private could reach someone it should not, and what stops each route.

## What we are protecting

Picked highlight photos from a trip, often with faces, seen by the travellers and by the few
viewers every traveller approved. The promise: nobody else sees them, a traveller can hide any
photo from viewers at any time, and removing a viewer or narrowing the trip takes effect at once.

## Can photos just be links to Google Photos or iCloud?

No, not for photos shown inside the app. This was checked against the providers' own pages.

- **Google Photos.** Since 31 March 2025 an outside app can only read photos it created itself
  or ones the person picks through Google's picker. A picked photo's address works for 60
  minutes and needs the person's Google sign-in on every request, so it cannot be shown to a
  friend. ([Google's API updates](https://developers.google.com/photos/support/updates),
  [picker guide](https://developers.google.com/photos/picker/guides/media-items))
- **iCloud.** Apple offers no way for a website to read someone's photos. A shared album with
  "public website" on can be opened by anyone who has the link.
  ([Apple's guide](https://support.apple.com/en-nz/guide/icloud-windows/icwe010db4bc/icloud))
- **Share links break our rules.** A Google or iCloud share link is "anyone with the link".
  That is exactly the public link the group ruled out: it keeps working after a viewer is
  removed, it ignores a hidden photo, it can be forwarded, and it usually opens the whole album
  with the owner's name on it.

What works instead, and is built into the tables:

1. **Pick from Google Photos or the phone's library, keep a small copy.** The picker is only a
   way to choose. The app shrinks the photo on the device and stores that copy.
2. **Keep the full album where it is.** `trip_private_links` holds a link to the group's album
   that only travellers ever see and that opens outside the app.

Storage is not the cost to worry about. A highlight shrunk to about 2,000 pixels wide is
roughly 0.4 MB. A trip capped at 300 photos is at most about 120 MB, and a typical trip of 60
is about 25 MB. Supabase includes 1 GB free and 100 GB on the $25 plan, then about $0.02 per
GB a month ([pricing](https://supabase.com/pricing)). A hundred typical trips is under 3 GB.

## Routes to a leak, and what stops each

| # | How it could go wrong | What stops it | Status |
| --- | --- | --- | --- |
| 1 | Someone without an account opens a photo address | The bucket is private and the signed-out role has no rights | Built, tested |
| 2 | A member who is not on the trip guesses a trip or photo id | Row level security on the row and on the file; ids are random | Built, tested |
| 3 | A viewer keeps a photo's address after it is hidden, or after they are removed | The file is checked against the same rule every time an address is issued | Built, tested |
| 4 | A photo address is forwarded to someone else | Only short-lived signed addresses are issued (see "To build") | To build |
| 5 | One traveller widens the audience alone | Each person can change only their own choice; the most private wins | Built, tested |
| 6 | One traveller ends the trip early by editing its date, opening it to viewers | A trip that has not ended cannot be back-dated | Built, tested |
| 7 | A new traveller joins and inherits an audience they never agreed to | They join on the most private setting and have approved no viewer | Built, tested |
| 8 | A traveller leaves and a photo they hid reappears | A hide outlives the person who made it | Built, tested |
| 9 | The photo carries its GPS position or the phone's details | No location column exists; the upload code must strip the file's hidden data | Table tested, upload to build |
| 10 | The person who runs the app browses private trips | Admins have no read access to trips, photos or files | Built, tested |
| 11 | A future table or view is added without rules | The structure tests fail the pull request | Built, tested |
| 12 | The all-powerful server key ends up in the app or the repo | It is never used in the browser; secret scanning on the repo | Practice, to set up |
| 13 | A viewer screenshots or saves a photo | Nothing technical can stop this. It is why every traveller approves each viewer | Accepted |
| 14 | A viewer's or traveller's account is taken over | Emailed sign-in codes; a "sign out everywhere" button; short sessions | To build |
| 15 | Backups keep photos after they are deleted | Say so in the privacy page; backups roll off within the provider's window | To write |
| 16 | A deleted photo's file is left behind | Delete file and row together; a nightly sweep removes files with no row | To build |
| 17 | Photos are cached by a shared computer or a CDN | Serve with `Cache-Control: private` and short-lived addresses | To build |
| 18 | Someone uploads a huge or non-image file | The bucket accepts only JPEG and WebP up to 1.5 MB | Built (bucket settings) |
| 19 | An illegal image is uploaded | Report button and the procedure in the privacy plan; no automatic scanning of private files yet | Open |

## To build with the photo feature

- **Signed addresses that last minutes, not days.** Ask for a signed address when the photo is
  about to be shown, valid for about 10 minutes. Never store one, and never put one in a
  notification or an email. A forwarded address then dies quickly, and hiding a photo is
  complete within minutes even for someone who had it open.
- **Strip hidden data on the device.** Redraw the photo to a canvas and export it, which drops
  GPS, camera and owner details. Read the time taken before doing so if the story needs it.
- **Delete both halves.** Removing a photo deletes the row and the file. The same when someone
  leaves a trip or deletes their account, where the database removes the rows itself and the
  sweep has to catch the files.
- **Emails carry no photos.** "Sam added 3 photos" with a link into the app, never the image.

## What this review did not cover

The tests run against an imitation of Supabase's sign-in and file tables, because there is no
project yet. Before real photos go in, run them once against a real Supabase and try routes
1 to 3 by hand with two real accounts.
