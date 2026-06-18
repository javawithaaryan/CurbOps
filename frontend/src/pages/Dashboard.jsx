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

         <h1>Operational Intelligence</h1>

<p>
Monitoring parking-induced congestion across Bengaluru.
</p>

<p>
Priority enforcement recommendations will appear here.
</p>


        </div>

      </div>

    </div>
  );
}