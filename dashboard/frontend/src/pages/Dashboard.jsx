import OverviewCard from "../components/OverviewCard";
import dashboardStats from "../data/dashboardStats";

function Dashboard() {
  return (
    <div className="flex h-screen">

      {/* Sidebar */}

      <div className="w-80 bg-slate-900 text-white p-4">
        <h1 className="text-2xl font-bold">
          CURBOPS
        </h1>

        <p className="mt-2">
          Parking Enforcement Intelligence
        </p>

        <p className="text-sm text-slate-400">
          Powered by CausaFlow AI
        </p>
      </div>

      {/* Main */}

      <div className="flex-1 bg-slate-100">

        {/* Top Bar */}

        <div className="h-20 bg-white flex items-center px-8 shadow">

          <div>

            <h1 className="text-2xl font-bold">
              Bengaluru Traffic Police
            </h1>

            <p className="text-slate-500">
              Operational Command Centre
            </p>

          </div>

        </div>

        {/* Content */}

        <div className="p-8">

          <h2 className="text-2xl font-semibold mb-4">
            City Overview
          </h2>

          <div className="flex gap-5 mb-8">

  {dashboardStats.map((item, index) => (
    <OverviewCard
      key={index}
      title={item.title}
      value={item.value}
    />
  ))}

</div>

          <h2 className="text-2xl font-semibold">
            Operational Intelligence
          </h2>

          <p className="mt-3">
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

export default Dashboard;