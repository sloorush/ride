a web interface to the Dyalog interpreter

![Screenshot](screenshot0.png?raw=true "Screenshot")
![Screenshot](screenshot1.png?raw=true "Screenshot")

From a browser
==============
                              RIDE
    ┌───────┐ HTTPS ┌─────┐ protocol ┌───────────┐
    │browser├───────┤proxy├──────────┤interpreter│
    └───────┘  :8443└─────┘     :4502└───────────┘

As a desktop application
========================
    ┌────────┐
    │NW.js   │   RIDE
    │ ┌─────┐│ protocol ┌───────────┐
    │ │proxy├┼──────────┤interpreter│
    │ └─────┘│     :4502└───────────┘
    └────────┘

[NW.js](https://github.com/nwjs/nw.js) is an app runtime based on Chromium and NodeJS.
It is capable of containing both the proxy and the browser component in the same process, so communication between them can be short-circuited.
To package apps for the various platforms, run
    ./dist.sh
and find them under `./build/dyalogjs/`.

The desktop app can

* connect to an interpreter at a specified host:port
* spawn an interpreter process and connect to it
* listen for a connection from an interpreter at a specified port

Building
========

<h3>Prerequisits</h3>

<strong>All Operating Systems</strong>
* [Virtual Box](http://www.virtualbox.org)
* [Vagrant](https://www.vagrantup.com/)
* git (For windows see below)

<strong>Windows</strong>
* [Github for windows](https://windows.github.com/)

You will need to set your Git Shell to `Bash` in the options

<h3>Build</h3>

<strong>Windows</strong>

* Clone [RideJS](https://www.github.com/dyalog/RideJS) in Github for Windows
* Right click repository and `Open git Shell`
* run `./vagrantbuild.gitshell.sh`

<strong>Linux/OS X</strong>
* Clone [RideJS](https://www.github.com/dyalog/RideJS)
* cd to RideJS Directory
* run `./vagrantbuild.sh`

The build process will automatically launch Ride JS once it has finished building.
The first build will take a long time.



