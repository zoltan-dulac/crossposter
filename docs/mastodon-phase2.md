# Mastodon source  Phase 2 (experimental)


## What's implemented

- Right-click a Mastodon post → Crosspost
- Extract post text, paragraphs, and links
- Capture original post URL
- Capture author information
- Retrieve images and videos
- Preserve original image alt text
- Capture content warnings
- Identify sensitive media
- Protect followers-only and direct posts

The implementation uses Mastodon's public status API where possible. This provides more reliable information than extracting everything from the rendered page.

## How to test it

Start with a public Mastodon post containing text and an image.

    Open your configured Mastodon server in Firefox.
    Right-click inside a public post.
    Select Crosspost.
    Check whether Crossposter's composer contains the correct text, media, author, and original post link.
    Expand Original image description beneath an image to inspect its captured alt text.
