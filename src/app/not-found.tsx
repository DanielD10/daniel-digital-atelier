import Link from "next/link";

export default function NotFound() {
  return (
    <div className="msg-screen">
      <p className="msg-code">404</p>
      <h1>That page doesn&rsquo;t exist</h1>
      <p>
        It may have been renamed, or the link that sent you here is out of date.
      </p>
      <div className="msg-actions">
        <Link className="cta" href="/">
          Go home
        </Link>
        <Link className="cta" href="/work">
          See the work
        </Link>
      </div>
    </div>
  );
}
