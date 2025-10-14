'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'

export default function AlertsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-gray-600">Chartlink alerts will appear here.</p>
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Alerts</h3>
          <p>Loading alerts...</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
