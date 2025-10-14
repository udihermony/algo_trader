'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Activity, Play, Pause, Settings, RefreshCw, Plus } from 'lucide-react'

interface Strategy {
  id: number
  name: string
  description: string
  config: any
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchStrategies()
  }, [])

  const fetchStrategies = async () => {
    try {
      const response = await axios.get('/api/strategies')
      setStrategies(response.data.strategies || [])
    } catch (error) {
      console.error('Failed to fetch strategies:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchStrategies()
  }

  const toggleStrategy = async (strategyId: number, isActive: boolean) => {
    try {
      await axios.put(`/api/strategies/${strategyId}`, {
        is_active: !isActive
      })
      fetchStrategies() // Refresh the list
    } catch (error) {
      console.error('Failed to toggle strategy:', error)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
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

  const activeStrategies = strategies.filter(s => s.is_active)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Strategies</h1>
            <p className="text-gray-600">Manage your trading strategies and automation rules</p>
          </div>
          <div className="flex space-x-3">
            <button className="btn btn-primary btn-md">
              <Plus className="h-4 w-4 mr-2" />
              New Strategy
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn btn-secondary btn-md"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Card */}
        <div className="card p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-100">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Strategies</p>
              <p className="text-2xl font-semibold text-purple-600">
                {activeStrategies.length} / {strategies.length}
              </p>
            </div>
          </div>
        </div>

        {/* Strategies List */}
        <div className="space-y-4">
          {strategies.length > 0 ? (
            strategies.map((strategy) => (
              <div key={strategy.id} className="card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-3 rounded-lg bg-gray-100">
                      <Activity className="h-6 w-6 text-gray-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">{strategy.name}</h3>
                      <p className="text-sm text-gray-600">{strategy.description}</p>
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                        <span>Created: {new Date(strategy.created_at).toLocaleDateString()}</span>
                        <span>Updated: {new Date(strategy.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      strategy.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {strategy.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => toggleStrategy(strategy.id, strategy.is_active)}
                      className={`btn btn-sm ${
                        strategy.is_active ? 'btn-secondary' : 'btn-primary'
                      }`}
                    >
                      {strategy.is_active ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Start
                        </>
                      )}
                    </button>
                    <button className="btn btn-secondary btn-sm">
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Activity className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No strategies yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Create your first trading strategy to automate your trading.
              </p>
              <div className="mt-6">
                <button className="btn btn-primary btn-md">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Strategy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
