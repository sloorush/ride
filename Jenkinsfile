pipeline {
  agent none
  stages {
    stage('Build Linux & Windows') {
      agent {
        docker {
          image 'dyalog/node:lts'
          args '-v /devt:/devt'
        }
      }
      steps {
        checkout scm
        sh 'rm -Rf _ ship'
        sh 'npm i'
        sh './mk l a w'
        sh './CI/publish.sh'
        stash name: 'ride-win', includes: '_/ride*/Ride-*-win32-ia32/**'
        stash name: 'ride-linux', includes: '_/ride*/Ride-*-linux*/**'
        stash name: 'ride-version', includes: '_/version, _/version.js'
        sh 'rm -Rf _'
      }
    }
    stage ('Packaging') {
      parallel {
        stage ('Linux Packaging') {
          agent {
            docker {
              image 'dyalog/node:lts'
            }
          }
          steps {
            sh 'rm -Rf _ ship'
            unstash 'ride-linux'
            unstash 'ride-version'
            sh './CI/packagescripts/linux/packageLinux.sh'
            stash name: 'linux-ship', includes: 'ship/*'
            sh 'rm -Rf _ ship'
          }
        }
        stage ('Mac Build and Packaging') {
          agent {
            label 'Mac && Build'
          }
          steps {
            sh 'rm -Rf _ ship'
            sh 'npm i'
            sh './mk o'
            withCredentials([usernamePassword(credentialsId: '868dda6c-aaec-4ee4-845a-57362dec695b', passwordVariable: 'APPLE_APP_PASS', usernameVariable: 'APPLE_ID')]) {
              sh './CI/packagescripts/osx/packageOSX.sh'
            }
            stash name: 'ride-mac', includes: '_/ride*/Ride-*-darwin*/**'
            stash name: 'mac-ship', includes: 'ship/*'
            sh 'rm -Rf _ ship'
          }
        }
        stage ('Windows Packaging') {
          agent {
            label 'Windows'
          }
          steps {
            powershell 'if (Test-Path -Path ship) { rm -r ship }'
            powershell 'if (Test-Path -Path _) { rm -r _ }'
            unstash 'ride-win'
            unstash 'ride-version'
            bat './CI/packagescripts/windows/packageWindows.bat'
            stash name: 'win-ship', includes: 'ship/*'
            powershell 'rm -r ship'
            powershell 'rm -r _'
          }
        }
      }
    }
    stage ('Copy install images') {
      agent {
        docker {
          image 'dyalog/node:lts'
          args '-v /devt:/devt'
        }
      }
      steps {
        sh 'rm -Rf _ ship'
        unstash 'ride-win'
        unstash 'ride-mac'
        unstash 'ride-linux'
        unstash 'ride-version'
        unstash 'linux-ship'
        unstash 'mac-ship'
        unstash 'win-ship'
        sh './CI/copyinstallers.sh'
        sh 'rm -Rf _ ship'
      }
    }
    stage ('Publish to Github') {
      agent {
        docker {
          image 'dyalog/node:lts'
          args '-v /devt:/devt'
        }
      }
      environment {
        GHTOKEN = credentials('250bdc45-ee69-451a-8783-30701df16935')
      }
      steps {
        sh 'rm -Rf _ ship'
        unstash 'ride-version'
        unstash 'linux-ship'
        unstash 'mac-ship'
        unstash 'win-ship'
        sh './CI/GH-Release.sh'
        sh 'rm -Rf _ ship'
      }
    }
  }
}
