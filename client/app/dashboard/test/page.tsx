'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'

export default function TestAlertsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Alerts Test Page</h1>
        <p className="text-gray-600">This is a test page to verify routing works.</p>
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Test Content</h3>
          <p>If you can see this, the routing is working correctly.</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
