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

// documentation: http://auth0.github.io/node-auth0/
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
mongoose.connect(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_URL}`, {
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

app.get('/api/private/users', authCheck, (req, res) => {

    var params = {
      per_page: 100
    };

    managementClientInstance.getUsers(params, function (err, users) {
        if (err) {
            res.send(err)
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

app.get('/api/private/user', authCheck, (req, res) => {
    const userId = req.headers.userid.replace('-', '|')
    managementClientInstance.getUser({ id: userId }, function (err, user) {

        if (err) {
            res.send(err)
            console.log(err)
        }
        res.json(user)
    })
})

app.patch('/api/private/user', authCheck, (req, res) => {
    const userId = req.body.user.user_id
    const userData = {
        user_metadata: req.body.user.user_metadata
    }

    managementClientInstance.updateUser({ id: userId }, userData, function (err, user) {
        if (err) {
            console.log(err)
            res.send(err)
        }
        res.json(user)
    })
})

app.get('/api/public/event', (req, res) => {
    const id = req.query.id
    if (id) {
        Event.findById(id, function (err, event) {
            if (err) {
                res.send(err)
            }
            res.json(event)
        });
    } else {
        res.send('No event found')
    }
})

app.get('/api/private/events', authCheck, (req, res) => {
    Event.find({'isArchived': false }, function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/archivedevents', authCheck, (req, res) => {
    Event.find({'isArchived': true }, function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/signedupevents', authCheck, guard.check('view:dgevents'), (req, res) => {
    var userSub = jwtDecode(req.headers.authorization).sub
    Event.find({ 'eventDates.signedUpUsers.userId': userSub, 'isArchived': false }, function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/event', authCheck, guard.check('view:dgevents'), (req, res) => {
    Event.findById(req.headers.id, function (err, event) {
        if (err) {
            res.send(err)
        }
        res.json(event)
    })
})

app.post('/api/private/event', authCheck, (req, res) => {
    let event = new Event(req.body)

    event.save(function (err) {
        if (err) {
            return res.send(err)
        }
        res.json({message: 'Event successfully added!'})
    })
})

app.put('/api/private/event', authCheck, (req, res) => {
    let changedEvent = new Event(req.body)
    Event.findOneAndUpdate({'_id': changedEvent._id}, req.body, {upsert: true}, function (err, doc) {
        if (err) {
            return res.send(err)
        }
        res.json({success: true})
    })
})

app.delete('/api/private/event', authCheck, guard.check('delete:dgevent'), (req, res) => {
    const id = req.query.id
    Event.findByIdAndRemove(id, function(err) {
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

app.put('/api/private/event/signupguest', authCheck, guard.check('signup:dgevent'), (req, res) => {
    Event.findById(req.body.eventId, function (err, event) {
        event.eventDates[req.body.eventDatesIndex].guests.push(req.body.guestName)
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

app.post('/api/private/costumes', authCheck, (req, res) => {
    let costume = new Costume(req.body)
    costume.save(function (err) {
        if (err) {
            return res.send(err)
        }
        res.json({message: 'Costume successfully added!'})
    })
})

app.post('/api/private/email', authCheck, (req, res) => {
    Event.findById(req.body.id, function (err, event) {
        if (event) {
            managementClientInstance.getUsers(function (err, users) {
                if (err) {
                    console.log(err)
                }
                if (!users) {
                    console.error('No users found!')
                    return false
                }
                const emails = [];
                let recipientVariables = '';
                
                for (const user of users) {
                    if (user.email_verified && user.user_metadata.username) {
                        emails.push(user.email);
                        recipientVariables = recipientVariables + `"${user.email}": {"name": "${user.user_metadata.username}"},`;
                    }
                }

                const template = `
                    <style>
                    ul, li {
                        padding: 0;
                        margin: 0;
                        list-style: none;
                    }
                    </style>
                    <div>
                        <img style="float: left;" src="http://iris.501st.nl/img/icons/android-chrome-192x192.png" width="50" height="50" />
                        <span style="color:#3b5290; font-size: 20px; padding-left: 10px; line-height: 50px;">IRIS</span> 
                    </div>
                    <div style="clear: both;">
                        <p>Hoi %recipient.name%,</p>
                        <p>We willen het volgende evenement onder de aandacht brengen:</p>
                    </div>
                    <div><h1>${event.name}</strong></h1>
                    <div style="padding: 0 0 1em;">
                        ${event.description}
                    </div>
                    <div style="padding: 0 0 1em;">
                        ${req.body.html}
                    </div>
                    <div>
                    </div>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <table border="0" cellspacing="0" cellpadding="0">
                            <tr>
                              <td bgcolor="#3b5290" style="padding: 12px 18px 12px 18px; border-radius:3px" align="center"><a href="http://iris.501st.nl/event/${event.id}" target="_blank" style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; font-weight: normal; color: #ffffff; text-decoration: none; display: inline-block;">Bekijk evenement in IRIS</a></td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                `
                const DOMAIN = process.env.MAILGUN_DOMAIN;
                const mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_API_KEY, domain: DOMAIN });

                const data = {
                  from: 'IRIS <iris@501st.nl>',
                  to: emails.join(', '),
                  subject: `IRIS event: ${event.name}`,
                  html: template,
                  text: 'Your e-mail client doesn\'t support HTML.',
                  'recipient-variables': `{${recipientVariables.slice(0, -1)}}`
                };


                // const data = {
                //   from: 'IRIS <iris@501st.nl>',
                //   to: "tomfranssen1983@gmail.com",
                //   subject: `IRIS event: ${event.name}`,
                //   html: template,
                //   text: 'Your e-mail client doesn\'t support HTML.',
                //   'recipient-variables': '{"tomfranssen1983@gmail.com": {"first":"Alice", "name": "Tom Franssen"}}'
                // };

                mailgun.messages().send(data, function (error, body) {
                    if (error) {
                        res.status(400).json({message: 'Oops! Something went wrong with sending the e-mails'})
                    } else {
                        res.json({message: 'E-mail successfully send!'})
                    }
                });
            })
        } else {
            res.status(400).send('invalid id...')
        }  
    })
})



app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
        res.status(401).send('invalid token...')
    }
})

app.listen(process.env.PORT)
console.log(`Listening on localhost:${process.env.PORT}`)

