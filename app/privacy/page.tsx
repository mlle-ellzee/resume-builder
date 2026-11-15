export const metadata = { title: "Privacy - Resume Builder" };

export default function Privacy() {
  return (
    <main className="narrow">
      <h1>Privacy policy</h1>
      <p>
        Resume Builder is a personal tool used by its owner only. Sign-in is limited to one Google account.
      </p>
      <h2>What it accesses</h2>
      <p>
        With Google's <code>drive.file</code> permission, the app can open only the files you choose in its file picker (a
        resume template and a bullet-bank spreadsheet) and the documents it creates. It cannot see the rest of your Drive.
      </p>
      <h2>What it stores</h2>
      <p>
        The app has no database. Your Google sign-in token and the IDs of your chosen files are kept in encrypted cookies in
        your browser. Your job description and draft picks are kept in your browser&apos;s local storage.
      </p>
      <h2>What it shares</h2>
      <p>
        To choose resume content, the app sends the job description and the contents of your bullet bank to Anthropic&apos;s
        Claude API. Nothing is sold or shared with anyone else.
      </p>
      <h2>Removing access</h2>
      <p>
        Sign out to delete the cookies, and remove the app at myaccount.google.com/permissions to revoke its Google access.
      </p>
    </main>
  );
}
