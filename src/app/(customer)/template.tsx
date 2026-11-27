/**
 * Menu → checkout → confirmation all live in this route group, so the root template
 * never re-mounts between them; this one does, and each step fades in.
 */
export default function CustomerTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page flex flex-1 flex-col">{children}</div>;
}
