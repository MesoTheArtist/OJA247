import { Link } from "react-router-dom";
import VerifiedBadge from "./VerifiedBadge";

function BusinessCard({ business }) {
  return (
    <Link to={`/business/${business.slug || business._id}`} state={{ internalNav: true }}>
      <div className="border rounded-lg p-4 shadow hover:shadow-lg transition cursor-pointer">
        <img
          src={business.logo || "https://via.placeholder.com/150"}
          alt={business.name}
          className="w-full h-40 object-cover rounded"
        />

        <div className="flex items-center gap-2 mt-3 min-w-0">
          <h2 className="text-xl font-bold truncate">{business.name}</h2>
          {business.verified && <VerifiedBadge />}
        </div>
        <p className="text-gray-600">{business.category}</p>
      </div>
    </Link>
  );
}

export default BusinessCard;