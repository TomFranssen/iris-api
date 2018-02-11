'use strict'

require('dotenv-safe').load({
    path: './.env',
    sample: './.env.example'
})

const express = require('express')
const app = express()
const router = express.Router()
const request = require('request')
const jwt = require('express-jwt')
const jwks = require('jwks-rsa')
const jwtDecode = require('jwt-decode')
const guard = require('express-jwt-permissions')({
    permissionsProperty: 'http://iris.501st.nl/claims/permissions'
})
const cors = require('cors')
const bodyParser = require('body-parser')
const Event = require('./model/events')
const Costume = require('./model/costumes')
const mongoose = require('mongoose')

const ManagementClient = require('auth0').ManagementClient
const managementClientInstance = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.MANAGEMENT_CLIENT_ID,
    clientSecret: process.env.MANAGEMENT_CLIENT_SECRET,
    scope: 'read:users update:users'
})

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers'
    )
    res.setHeader('Cache-Control', 'no-cache')
    next()
})

mongoose.Promise = global.Promise
mongoose.connect(`mongodb://iris:${process.env.DB_PASSWORD}@ds133044.mlab.com:33044/iris`, {
    keepAlive: true,
    reconnectTries: Number.MAX_VALUE
})

const authCheck = jwt({
    secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
    }),
    audience: process.env.AUTH0_AUDIENCE,
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    algorithms: ['RS256']
})

app.get('/api/private/users', (req, res) => {
    managementClientInstance.getUsers(function (err, users) {
        if (err) {
            console.log(err)
        }
        res.json(users)
    })
})

app.get('/api/501stusers', (req, res) => {
    request(
        {
            uri: 'http://www.501st.com/api/garrisons/31/members'
        }
    ).pipe(res);
})

app.get('/api/private/user', (req, res) => {
    const userId = req.headers.userid.replace('-', '|')
    managementClientInstance.getUser({ id: userId }, function (err, user) {

        if (err) {
            console.log(err)
        }
        res.json(user)
    })
})

app.patch('/api/private/user', (req, res) => {
    const userId = req.body.user.user_id
    const userData = {
        user_metadata: req.body.user.user_metadata
    }

    managementClientInstance.updateUser({ id: userId }, userData, function (err, user) {
        if (err) {
            console.log(err)
        }
        res.json(user)
    })
})

app.get('/api/private/events', authCheck, (req, res) => {
    Event.find(function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/signedupevents', (req, res) => {
    var userSub = jwtDecode(req.headers.authorization).sub
    Event.find({ 'eventDates.signedUpUsers.userId': userSub }, function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/event', (req, res) => {
    Event.findById(req.headers.id, function (err, event) {
        if (err) {
            res.send(err)
        }
        res.json(event)
    })
})

app.post('/api/private/event', (req, res) => {
    let event = new Event(req.body)

    event.save(function (err) {
        if (err) {
            return res.send(err)
        }
        res.json({message: 'Event successfully added!'})
    })
})

app.put('/api/private/event', (req, res) => {
    let changedEvent = new Event(req.body)
    Event.findOneAndUpdate({'_id': changedEvent._id}, req.body, {upsert: true}, function (err, doc) {
        if (err) {
            return res.send(err)
        }
        res.json({success: true})
    })
})

app.put('/api/private/event/signup', authCheck, guard.check('signup:dgevent'), (req, res) => {
    const signUpData = {
        signUpDate: new Date(),
        username: req.body.username,
        costume: req.body.costume,
        avatar: req.body.avatar,
        userId: req.body.userId
    }

    Event.findById(req.body.eventId, function (err, event) {
        event.eventDates[req.body.eventDatesIndex].signedUpUsers.push(signUpData)
        event.save(function (err) {
            if (err) {
                return res.send(err)
            }
            res.json({success: true})
        })
    })
})

app.post('/api/private/event/signout', authCheck, guard.check('signup:dgevent'), (req, res) => {
    var userSub = jwtDecode(req.headers.authorization).sub

    if (userSub === req.body.userId) { // check if front-end user ID matched the JWT user ID
        Event.findById(req.body.eventId, function (err, event) {
            let signUpToRemove = event.eventDates[req.body.eventDateIndex].signedUpUsers.splice(req.body.indexToMoveToCancelled, 1)[0]
            let cancelledItem = {}

            cancelledItem.signoutReason = req.body.signoutReason
            cancelledItem.username = signUpToRemove.username
            cancelledItem.signUpDate = signUpToRemove.signUpDate
            cancelledItem.costume = signUpToRemove.costume
            cancelledItem.userId = signUpToRemove.userId

            event.eventDates[req.body.eventDateIndex].cancelledUsers.push(cancelledItem)

            event.save(function (err) {
                if (err) {
                    return res.send(err)
                }
                res.json({message: 'You have been signed out!'})
            })
        })
    } else {
        console.log(`User ID from signed up user ${req.body.userId} does not match that from JWT ${userSub}`)
    }
})

app.get('/api/private/costumes', authCheck, (req, res) => {
    Costume.find(function (err, costumes) {
        if (err) {
            res.send(err)
        }
        res.json(costumes)
    })
})

app.post('/api/private/costumes', (req, res) => {
    let costume = new Costume(req.body)
    costume.save(function (err) {
        if (err) {
            return res.send(err)
        }
        res.json({message: 'Costume successfully added!'})
    })
})

app.use(function (err, req, res, next) {
    console.log(err)
    if (err.name === 'UnauthorizedError') {
        res.status(401).send('invalid token...')
    }
})

app.listen(process.env.PORT)
console.log(`Listening on localhost:${process.env.PORT}`)
