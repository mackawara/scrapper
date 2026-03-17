"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BidStats {
  total: number;
  winning: number;
  losing: number;
  overMax: number;
  failed: number;
  currentStatus?: string;
  latestBidAmount?: number;
  latestBidAt?: string;
  maxBid?: number;
  isOutbid?: boolean;
  currentPriceNow?: number;
}

interface Bid {
  _id: string;
  watchedProductId: string;
  productTitle?: string;
  bidAmount: number;
  status: "winning" | "losing" | "overMax" | "failed" | "outbid";
  success: boolean;
  currentPriceAtBid?: number;
  currentPriceNow?: number;
  createdAt: string;
  error?: string;
}

interface WatchedProduct {
  _id: string;
  title: string;
  productUrl: string;
}

export default function BidsPage() {
  const [watchedProducts, setWatchedProducts] = useState<WatchedProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [stats, setStats] = useState<BidStats | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(false);

  // Load watched products
  useEffect(() => {
    const fetchWatchedProducts = async () => {
      try {
        const res = await fetch("/api/abc-auctions/watch");
        const data = await res.json();
        setWatchedProducts(data.watched || []);
        if (data.watched?.[0]) {
          setSelectedProductId(data.watched[0]._id);
        }
      } catch (err) {
        console.error("Failed to fetch watched products", err);
      }
    };

    fetchWatchedProducts();
  }, []);

  // Load stats and bids for selected product
  useEffect(() => {
    if (!selectedProductId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, bidsRes] = await Promise.all([
          fetch(`/api/abc-auctions/bids/stats?watchedProductId=${selectedProductId}`),
          fetch(`/api/abc-auctions/bids?watchedProductId=${selectedProductId}&limit=50`),
        ]);

        const statsData = await statsRes.json();
        const bidsData = await bidsRes.json();

        setStats(statsData.stats);
        setBids(bidsData.bids || []);
      } catch (err) {
        console.error("Failed to fetch bids data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, [selectedProductId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "winning":
        return "bg-green-100 text-green-800";
      case "losing":
        return "bg-red-100 text-red-800";
      case "overMax":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Bids Tracker</h1>

        {/* Product selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Product
          </label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">Choose a product...</option>
            {watchedProducts.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {selectedProductId && stats && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Bids</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-green-600">{stats.winning}</div>
                <div className="text-sm text-gray-600">Winning</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-red-600">{stats.losing}</div>
                <div className="text-sm text-gray-600">Losing</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-yellow-600">{stats.overMax}</div>
                <div className="text-sm text-gray-600">Over Max</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-2xl font-bold text-gray-600">{stats.failed}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
            </div>

            {/* Current status */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h2 className="text-lg font-semibold mb-4">Current Status</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(stats.currentStatus || '')}`}>
                    {stats.currentStatus || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Latest Bid</div>
                  <div className="text-lg font-semibold">US${stats.latestBidAmount || "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Max Bid</div>
                  <div className="text-lg font-semibold">US${stats.maxBid || "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Current Price</div>
                  <div className="text-lg font-semibold">US${stats.currentPriceNow || "—"}</div>
                </div>
              </div>
              {stats.isOutbid && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                  ⚠️ You have been outbid in the last 10 minutes!
                </div>
              )}
            </div>

            {/* Bids table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Bid History</h2>
              </div>
              {loading ? (
                <div className="p-6 text-center text-gray-500">Loading bids...</div>
              ) : bids.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No bids placed yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Bid Amount
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Price at Bid
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Current Price
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bids.map((bid) => (
                        <tr key={bid._id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {new Date(bid.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                            US${bid.bidAmount}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getStatusColor(bid.status)}`}>
                              {bid.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            US${bid.currentPriceAtBid || "—"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            US${bid.currentPriceNow || "—"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {!bid.success && bid.error && (
                              <span className="text-red-600">{bid.error}</span>
                            )}
                            {bid.status === "losing" && (
                              <span className="text-yellow-600">Outbid</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!selectedProductId && (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
            Select a product to view bid history
          </div>
        )}
      </div>
    </div>
  );
}
