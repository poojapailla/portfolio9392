# Pailla Pooja Portfolio

A self-hosted portfolio with a public visitor page, SQLite-backed editable content, a separate owner dashboard, and uploads for profile images, project images, certificates, and a resume PDF.

## Run locally

1. Install Python 3.9 or newer if it is not already installed.
2. From this folder, run `python server.py`.
3. Open `http://127.0.0.1:8000` and choose **Visit portfolio** or **Admin sign in**.
4. Choose **Admin sign in** (or open `/admin`). The admin ID is `pooja9392`; on first setup, choose a non-empty owner password.

The owner password can be any non-empty text and is stored as a salted PBKDF2 hash; the dashboard uses an HTTP-only session cookie and CSRF tokens. Choose a private password and avoid reusing one you use for other accounts. The server binds to localhost by default. To host it publicly, put it behind HTTPS and a production-grade reverse proxy, set `PORTFOLIO_HTTPS=1`, configure backups, and only then set `PORTFOLIO_HOST` to a network interface. Never expose the development server directly to the internet.

## Edit content and upload assets

Edit profile, contact details, summary, education, work experience, skills, certifications, and resume in the dashboard's plain-text fields. Education uses one pipe-separated school per line; experience uses a `Company | Role | Dates` heading followed by `- responsibility` lines, with a blank line between jobs; skills use `Category: skill, skill`; certifications use `Provider | Certificate name | optional file path`. Save all text changes to publish them.

The **Projects** manager includes **Add project** and per-project edit/delete actions. Enter a name, description, optional URL or image path, and optional features (one per line), then save; the public portfolio updates immediately. There is no project-count limit.

Upload an image or PDF in the dashboard and copy its returned path into the relevant field:

- Profile photo: `profile.image`
- Project image: that project's `image`
- Certificate: that certificate's `file`
- Resume PDF: `resume.file`

For example, set `"resume": {"file": "/uploads/your-file.pdf"}` after uploading the PDF. Resume links appear on the public portfolio only when the file field points to an uploaded PDF.

Portfolio data lives in `data/portfolio.sqlite3`; uploaded files live in `uploads/`. Back up both folders. Uploaded assets support PNG, JPG, WEBP, and PDF up to 10 MB.