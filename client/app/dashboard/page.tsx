'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { TrendingUp, TrendingDown, AlertTriangle, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface DashboardData {
  summary: {
    activePositions: number
    todayPnL: number
    pendingOrders: number
    activeStrategies: number
  }
  recentAlerts: Array<{
    symbol: string
    action: string
    price: number
    received_at: string
    status: string
  }>
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && user) {
      fetchDashboardData()
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [user, authLoading])

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/settings/dashboard')
      setData(response.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please log in</h1>
          <p className="text-gray-600">You need to be logged in to view the dashboard.</p>
        </div>
      </DashboardLayout>
    )
  }

  const stats = [
    {
      name: 'Active Positions',
      value: data?.summary.activePositions || 0,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      name: "Today's P&L",
      value: `₹${data?.summary.todayPnL?.toLocaleString() || '0'}`,
      icon: data?.summary.todayPnL && data.summary.todayPnL >= 0 ? TrendingUp : TrendingDown,
      color: data?.summary.todayPnL && data.summary.todayPnL >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: data?.summary.todayPnL && data.summary.todayPnL >= 0 ? 'bg-green-100' : 'bg-red-100'
    },
    {
      name: 'Pending Orders',
      value: data?.summary.pendingOrders || 0,
      icon: ShoppingCart,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      name: 'Active Strategies',
      value: data?.summary.activeStrategies || 0,
      icon: AlertTriangle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    }
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.name} className="card p-6">
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className={`text-2xl font-semibold ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Alerts</h3>
          </div>
          <div className="p-6">
            {data?.recentAlerts && data.recentAlerts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Symbol
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.recentAlerts.map((alert, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {alert.symbol}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`badge ${
                            alert.action === 'BUY' ? 'badge-success' : 
                            alert.action === 'SELL' ? 'badge-danger' : 
                            'badge-gray'
                          }`}>
                            {alert.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₹{alert.price?.toLocaleString() || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`badge ${
                            alert.status === 'PROCESSED' ? 'badge-success' :
                            alert.status === 'PENDING' ? 'badge-warning' :
                            alert.status === 'ERROR' ? 'badge-danger' :
                            'badge-gray'
                          }`}>
                            {alert.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(alert.received_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Alerts from Chartlink will appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="btn btn-primary btn-md">
              <TrendingUp className="h-4 w-4 mr-2" />
              View Positions
            </button>
            <button className="btn btn-secondary btn-md">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Check Orders
            </button>
            <button className="btn btn-secondary btn-md">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Manage Strategies
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
