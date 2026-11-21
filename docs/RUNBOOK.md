# Running Tandem Roads: what to do when something goes wrong

Written for one person looking after the app. Each section is short and says what to click.

## How you will hear about a problem

- **The live site is down.** A check runs every morning (`Site health`). If the site does not load, it opens an issue called "The live site is down" and assigns it to you, so GitHub emails you. The issue closes itself when the site is back.
- **A change is broken.** Every pull request runs `Check`. A red cross means it cannot be trusted, and it should not be merged.
- **A deploy failed.** `Deploy to GitHub Pages` runs the same checks before publishing. If they fail, the old version of the site stays up and GitHub emails you about the failed run.

## The site is down

1. Open the site yourself: https://tandemroads.com/. If it loads, the check hit a brief outage. Run `Site health` again from the Actions tab (Run workflow) and the issue will close.
2. Look at https://www.githubstatus.com. If GitHub Pages is having trouble, wait. Nothing needs doing.
3. Open the Actions tab and look at the latest `Deploy to GitHub Pages` run. If it is red, go to "A bad change went live" below.
4. If none of that explains it, ask Claude in the project: "The live site is down, see the open issue."

## A bad change went live

The fastest safe fix is to undo the change, not to repair it.

1. Open the pull request that caused it (Pull requests, Closed, most recent).
2. Press **Revert** at the bottom. GitHub opens a new pull request that undoes it.
3. Wait for the green tick on `Check`, then merge. The site republishes in about two minutes.
4. Fix the original change afterwards, without the clock running.

## The weekly data refresh broke something

Every Monday `Refresh popularity signals` updates readership numbers and commits straight to the main branch. The deploy that follows runs the checks first, so bad data cannot go live. If that deploy is red:

1. Open the failed run and read the last lines. It names the city file and the problem.
2. Either fix the file, or revert the "Refresh popularity signals" commit.

## Someone's saved trip has gone

Until accounts exist, saved places live only in that person's browser. They are lost if the browser's data is cleared or the person changes phone.

- Ask them to open Trip, then Share, then More, and press **Save a backup file** now and then.
- A backup is restored from the same menu with **Open a backup file**.

## Before accounts and photos arrive

These parts are not built yet. They are listed so nothing is forgotten when the database goes live:

- A nightly copy of the database, kept for 30 days, with a restore tried once before friends join.
- A daily nudge so the free database does not pause after seven quiet days.
- Reported photos and comments hidden automatically until you have looked.
- A one-page plan for a privacy incident: who is told, within what time, and what is switched off first.
- A "Tell us" address on the app's own domain, so your personal email is never published.
- One trusted person who can act when you are away.
