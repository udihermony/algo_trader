'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Settings, Save, RefreshCw, Key, Bell, Clock } from 'lucide-react'

interface SettingsData {
  fyers_credentials: {
    app_id: string
    secret_key: string
    access_token: string
  }
  risk_params: {
    max_position_size: number
    stop_loss_percentage: number
    take_profit_percentage: number
  }
  notification_prefs: {
    email_alerts: boolean
    sms_alerts: boolean
    telegram_alerts: boolean
  }
  trading_hours: {
    start_time: string
    end_time: string
    timezone: string
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({
    fyers_credentials: {
      app_id: '',
      secret_key: '',
      access_token: ''
    },
    risk_params: {
      max_position_size: 10000,
      stop_loss_percentage: 2,
      take_profit_percentage: 5
    },
    notification_prefs: {
      email_alerts: true,
      sms_alerts: false,
      telegram_alerts: false
    },
    trading_hours: {
      start_time: '09:15',
      end_time: '15:30',
      timezone: 'Asia/Kolkata'
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/settings')
      if (response.data) {
        setSettings(prev => ({
          ...prev,
          ...response.data
        }))
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put('/api/settings', settings)
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (section: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof SettingsData],
        [field]: value
      }
    }))
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600">Configure your trading preferences and API credentials</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-md"
          >
            <Save className={`h-4 w-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Fyers API Settings */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Key className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Fyers API Credentials</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">App ID</label>
              <input
                type="text"
                value={settings.fyers_credentials.app_id}
                onChange={(e) => handleInputChange('fyers_credentials', 'app_id', e.target.value)}
                className="input"
                placeholder="Your Fyers App ID"
              />
            </div>
            <div>
              <label className="label">Secret Key</label>
              <input
                type="password"
                value={settings.fyers_credentials.secret_key}
                onChange={(e) => handleInputChange('fyers_credentials', 'secret_key', e.target.value)}
                className="input"
                placeholder="Your Fyers Secret Key"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Access Token</label>
              <input
                type="password"
                value={settings.fyers_credentials.access_token}
                onChange={(e) => handleInputChange('fyers_credentials', 'access_token', e.target.value)}
                className="input"
                placeholder="Your Fyers Access Token"
              />
            </div>
          </div>
        </div>

        {/* Risk Management */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Settings className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Risk Management</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Max Position Size (₹)</label>
              <input
                type="number"
                value={settings.risk_params.max_position_size}
                onChange={(e) => handleInputChange('risk_params', 'max_position_size', parseInt(e.target.value))}
                className="input"
                placeholder="10000"
              />
            </div>
            <div>
              <label className="label">Stop Loss (%)</label>
              <input
                type="number"
                step="0.1"
                value={settings.risk_params.stop_loss_percentage}
                onChange={(e) => handleInputChange('risk_params', 'stop_loss_percentage', parseFloat(e.target.value))}
                className="input"
                placeholder="2.0"
              />
            </div>
            <div>
              <label className="label">Take Profit (%)</label>
              <input
                type="number"
                step="0.1"
                value={settings.risk_params.take_profit_percentage}
                onChange={(e) => handleInputChange('risk_params', 'take_profit_percentage', parseFloat(e.target.value))}
                className="input"
                placeholder="5.0"
              />
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Bell className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Notification Preferences</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notification_prefs.email_alerts}
                onChange={(e) => handleInputChange('notification_prefs', 'email_alerts', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">Email Alerts</label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notification_prefs.sms_alerts}
                onChange={(e) => handleInputChange('notification_prefs', 'sms_alerts', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">SMS Alerts</label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={settings.notification_prefs.telegram_alerts}
                onChange={(e) => handleInputChange('notification_prefs', 'telegram_alerts', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">Telegram Alerts</label>
            </div>
          </div>
        </div>

        {/* Trading Hours */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Clock className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Trading Hours</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Start Time</label>
              <input
                type="time"
                value={settings.trading_hours.start_time}
                onChange={(e) => handleInputChange('trading_hours', 'start_time', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">End Time</label>
              <input
                type="time"
                value={settings.trading_hours.end_time}
                onChange={(e) => handleInputChange('trading_hours', 'end_time', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select
                value={settings.trading_hours.timezone}
                onChange={(e) => handleInputChange('trading_hours', 'timezone', e.target.value)}
                className="input"
              >
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
