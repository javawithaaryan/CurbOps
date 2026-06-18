function OverviewCard({ title, value }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow w-44">

      <p className="text-slate-500">
        {title}
      </p>

      <h2 className="text-3xl font-bold mt-2">
        {value}
      </h2>

    </div>
  );
}

export default OverviewCard;