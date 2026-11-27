/**
 * Each admin page fades in inside the sidebar, which itself stays put (it lives in
 * admin/layout.tsx, and layouts persist across navigation where templates don't).
 */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
