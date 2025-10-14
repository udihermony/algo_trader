'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { TrendingUp, TrendingDown, RefreshCw, DollarSign } from 'lucide-react'

interface Position {
  id: number
  symbol: string
  quantity: number
  avg_price: number
  current_price: number
  unrealized_pnl: number
  realized_pnl: number
  opened_at: string
  is_active: boolean
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchPositions()
  }, [])

  const fetchPositions = async () => {
    try {
      const response = await axios.get('/api/positions')
      setPositions(response.data.positions || [])
    } catch (error) {
      console.error('Failed to fetch positions:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchPositions()
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString()}`
  }

  const formatPercentage = (pnl: number, avgPrice: number) => {
    const percentage = (pnl / (avgPrice * 100)) * 100
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const activePositions = positions.filter(p => p.is_active)
  const totalUnrealizedPnL = activePositions.reduce((sum, p) => sum + p.unrealized_pnl, 0)
  const totalRealizedPnL = positions.reduce((sum, p) => sum + p.realized_pnl, 0)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
            <p className="text-gray-600">Monitor your current trading positions and P&L</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-secondary btn-md"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-100">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Positions</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {activePositions.length}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${totalUnrealizedPnL >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {totalUnrealizedPnL >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-green-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Unrealized P&L</p>
                <p className={`text-2xl font-semibold ${totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalUnrealizedPnL)}
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${totalRealizedPnL >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <DollarSign className={`h-6 w-6 ${totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Realized P&L</p>
                <p className={`text-2xl font-semibold ${totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalRealizedPnL)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Positions Table */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Current Positions ({activePositions.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            {activePositions.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unrealized P&L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % Change
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opened
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {activePositions.map((position) => (
                    <tr key={position.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <TrendingUp className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {position.symbol}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(position.avg_price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.current_price ? formatCurrency(position.current_price) : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          position.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(position.unrealized_pnl)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          position.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {position.current_price ? formatPercentage(position.unrealized_pnl, position.avg_price) : 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(position.opened_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No active positions</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Your trading positions will appear here once you start trading.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
