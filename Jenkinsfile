
pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        timeout(time: 20, unit: 'MINUTES')
    }

    stages {

        // 1. Checkout Code from GitHub
        stage('Git Checkout') {
            steps {
                echo 'Downloading source code from GitHub...'

                checkout scm

                echo 'GitHub checkout completed!'
            }
        }

        // 2. Install Dependencies
        stage('Install Dependencies') {
            steps {
                echo 'Installing Root Dependencies...'

                sh '''
                    npm install --no-audit --no-fund
                '''

                echo 'Installing Client Dependencies...'

                dir('client') {
                    sh '''
                        npm install --no-audit --no-fund
                    '''
                }

                echo 'Installing Server Dependencies...'

                dir('server') {
                    sh '''
                        npm install --no-audit --no-fund
                    '''
                }

                echo 'All dependencies installed successfully!'
            }
        }

        // 3. Build Frontend
        stage('Build Frontend') {
            steps {
                echo 'Building React Frontend...'

                sh '''
                    npm run build
                '''

                echo 'Frontend build completed!'
            }
        }

        // 4. Run Backend and API Tests
        stage('Run Tests') {
            steps {
                echo 'Starting Backend Server...'

                sh '''
                    set -eu

                    node server/index.js > server.log 2>&1 &
                    SERVER_PID=$!

                    cleanup() {
                        echo "Stopping Backend Server..."
                        kill "$SERVER_PID" 2>/dev/null || true
                        wait "$SERVER_PID" 2>/dev/null || true
                    }

                    trap cleanup EXIT

                    echo "Waiting for Backend Server on port 3001..."

                    READY=0

                    for i in $(seq 1 30); do

                        if node -e "
                            fetch('http://127.0.0.1:3001/api/movies')
                                .then(response => process.exit(response.ok ? 0 : 1))
                                .catch(() => process.exit(1))
                        "; then
                            READY=1
                            break
                        fi

                        sleep 1
                    done

                    if [ "$READY" -ne 1 ]; then
                        echo "Backend failed to start!"
                        cat server.log
                        exit 1
                    fi

                    echo "Backend started successfully!"

                    echo "Running API Tests..."

                    npm test

                    echo "All API Tests completed!"
                '''
            }
        }

    }

    post {

        success {
            echo 'SUCCESS: Movie Ticket Booking Pipeline Completed!'
        }

        failure {
            echo 'FAILED: Please check Jenkins Console Output.'
        }

        always {
            echo 'Pipeline execution finished.'
        }

    }
}
