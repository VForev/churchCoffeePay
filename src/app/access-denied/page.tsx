export const metadata = {
  title: 'Access required — LOTG Coffee',
};

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-heading font-bold text-primary mb-4">
          Access required
        </h1>
        <p className="font-body text-text-light mb-2">
          This ordering link is only available after paying through the Coffee tab in
          Pushpay.
        </p>
        <p className="font-body text-text-light text-sm">
          If you just paid and landed here, the link may have expired or already been
          used. Return to Pushpay and tap Coffee again.
        </p>
      </div>
    </div>
  );
}
