/** Checkout → confirmation is a navigation inside this segment; fade the new step in. */
export default function CheckoutTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page flex flex-1 flex-col">{children}</div>;
}
