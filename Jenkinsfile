
pipeline {
    agent any

    environment {
        CI = 'true'
    }

    stages {

        stage('Git Checkout') {
            steps {
                checkout scm
                echo 'Source code downloaded successfully'
            }
        }

        stage('Check Node & NPM') {
            steps {
                sh '''
                    node --version
                    npm --version
                '''
            }
        }

        stage('Install Root Dependencies') {
            steps {
                sh '''
                    npm ci
                '''
            }
        }

        stage('Install Client Dependencies') {
            steps {
                dir('client') {
                    sh '''
                        if [ -f package.json ]; then
                            if [ -f package-lock.json ]; then
                                npm ci
                            else
                                npm install
                            fi
                        fi
                    '''
                }
            }
        }

        stage('Install Server Dependencies') {
            steps {
                dir('server') {
                    sh '''
                        if [ -f package.json ]; then
                            if [ -f package-lock.json ]; then
                                npm ci
                            else
                                npm install
                            fi
                        fi
                    '''
                }
            }
        }

        stage('Build Client') {
            steps {
                dir('client') {
                    sh 'npm run build --if-present'
                }
            }
        }

        stage('Build Server') {
            steps {
                dir('server') {
                    sh 'npm run build --if-present'
                }
            }
        }

        stage('Run Tests') {
            steps {
                sh '''
                    npm run test --if-present
                '''

                dir('client') {
                    sh 'npm run test --if-present'
                }

                dir('server') {
                    sh 'npm run test --if-present'
                }
            }
        }
    }

    post {
        success {
            echo 'CI Pipeline completed successfully!'
        }

        failure {
            echo 'CI Pipeline failed. Check the console logs.'
        }

        always {
            echo 'Jenkins Pipeline finished.'
        }
    }
}
