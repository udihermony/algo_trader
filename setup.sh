#!/bin/bash

# Trading Web App Setup Script
# This script sets up the complete trading web application

set -e

echo "🚀 Starting Trading Web App Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_requirements() {
    print_status "Checking requirements..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL client (psql) not found. Make sure PostgreSQL is installed."
    fi
    
    print_status "Requirements check completed."
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install root dependencies
    npm install
    
    # Install server dependencies
    cd server
    npm install
    cd ..
    
    # Install client dependencies
    cd client
    npm install
    cd ..
    
    print_status "Dependencies installed successfully."
}

# Setup environment files
setup_environment() {
    print_status "Setting up environment files..."
    
    # Copy server environment file
    if [ ! -f server/.env ]; then
        cp server/env.example server/.env
        print_warning "Created server/.env from template. Please update with your actual values."
    else
        print_status "server/.env already exists."
    fi
    
    # Create client environment file
    if [ ! -f client/.env.local ]; then
        cat > client/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
EOF
        print_status "Created client/.env.local"
    else
        print_status "client/.env.local already exists."
    fi
    
    print_status "Environment files setup completed."
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    print_warning "Please make sure PostgreSQL is running and create a database named 'trading_app'"
    print_warning "You can do this by running:"
    print_warning "  createdb trading_app"
    print_warning "Or using psql:"
    print_warning "  psql -c 'CREATE DATABASE trading_app;'"
    
    read -p "Press Enter when you have created the database..."
    
    # Run database migrations
    cd server
    npm run db:migrate
    cd ..
    
    print_status "Database setup completed."
}

# Build client
build_client() {
    print_status "Building client application..."
    
    cd client
    npm run build
    cd ..
    
    print_status "Client build completed."
}

# Main setup function
main() {
    echo "📋 Trading Web App Setup"
    echo "========================"
    echo ""
    
    check_requirements
    install_dependencies
    setup_environment
    setup_database
    build_client
    
    echo ""
    print_status "🎉 Setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Update server/.env with your actual configuration values"
    echo "2. Start the development servers:"
    echo "   npm run dev"
    echo ""
    echo "The application will be available at:"
    echo "  Frontend: http://localhost:3000"
    echo "  Backend:  http://localhost:3001"
    echo ""
    echo "Default admin credentials:"
    echo "  Email: admin@tradingapp.com"
    echo "  Password: admin123"
    echo ""
    print_warning "Please change the default admin password after first login!"
}

# Run main function
main "$@"
