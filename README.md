# Pailla Pooja Portfolio

A self-hosted portfolio with a public visitor page, SQLite-backed editable content, a separate owner dashboard, and uploads for profile images, project images, certificates, and a resume PDF.

## Run locally

1. Install Python 3.9 or newer if it is not already installed.
2. From this folder, run `python server.py`.
3. Open `http://127.0.0.1:8000` for the public portfolio.
4. Open `http://127.0.0.1:8000/admin` to create the owner password and edit your portfolio.

The initial owner password must be at least 12 characters. It is stored as a salted PBKDF2 hash; the dashboard uses an HTTP-only session cookie and CSRF tokens. The server binds to localhost by default. To host it publicly, put it behind HTTPS and a production-grade reverse proxy, set `PORTFOLIO_HTTPS=1`, configure backups, and only then set `PORTFOLIO_HOST` to a network interface. Never expose the development server directly to the internet.

## Edit content and upload assets

The dashboard's JSON editor controls every public section. Keep its JSON valid, then select **Save changes**. Add as many project objects as you need to the `projects` array. The `dates` fields for internships start blank; only enter dates you can verify.

Upload an image or PDF in the dashboard and copy its returned path into the relevant field:

- Profile photo: `profile.image`
- Project image: that project's `image`
- Certificate: that certificate's `file`
- Resume PDF: `resume.file`

For example, set `"resume": {"file": "/uploads/your-file.pdf"}` after uploading the PDF. Resume links appear on the public portfolio only when the file field points to an uploaded PDF.

Portfolio data lives in `data/portfolio.sqlite3`; uploaded files live in `uploads/`. Back up both folders. Uploaded assets support PNG, JPG, WEBP, and PDF up to 10 MB.