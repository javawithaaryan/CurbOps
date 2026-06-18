export default function Dashboard() {
  return (
    <div className="flex h-screen">

      <div className="w-80 bg-slate-900">
        Sidebar
      </div>

      <div className="flex-1 bg-slate-100">

        <div className="h-20">
          TopBar
        </div>

        <div className="p-6">

          Dashboard Content

        </div>

      </div>

    </div>
  );
}