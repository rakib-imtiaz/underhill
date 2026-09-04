type Props = { show: boolean };

export default function Toast({ show }: Props) {
  return (
    <div className={`toast${show ? " show" : ""}`} role="status">
      <span className="toast-ico" aria-hidden="true" />
      <span>
        <strong>Message sent.</strong> Thank you — an Underhill specialist will be
        in touch shortly.
      </span>
    </div>
  );
}
