/**
 * Re-mounted by Next on every navigation between top-level sections (menu → checkout,
 * admin → barista), so each page fades in rather than snapping. Admin has its own
 * template for the pages inside its persistent sidebar.
 *
 * `flex-1 flex-col` because the body is a flex column and several pages rely on being
 * its direct child to fill the screen; this wrapper has to pass that through untouched.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page flex flex-1 flex-col">{children}</div>;
}
