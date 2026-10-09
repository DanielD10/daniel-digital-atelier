/**
 * Shown while a route segment streams in. Deliberately almost
 * nothing — on a dark site a flashing spinner is worse than a
 * held black frame.
 */
export default function Loading() {
  return (
    <div
      className="msg-screen"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span
        className="micro"
        style={{ opacity: 0.6, letterSpacing: "0.3em" }}
      >
        D/D
      </span>
    </div>
  );
}
