import Link from 'next/link';

export default function NotAuthorizedPage() {
  return (
    <div className="dashboard-container">
      <div className="card section">
        <h2>Not Authorized</h2>
        <p className="note">Instructor access required.</p>
        <p className="note"><Link href="/dashboard">Return to dashboard</Link></p>
      </div>
    </div>
  );
}
