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
const memorycache = require('memory-cache')

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
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE,PATCH')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers'
    )
    res.setHeader('Cache-Control', 'no-cache')
    next()
})

mongoose.Promise = global.Promise
mongoose.connect(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_URL}`, {
    keepAlive: true,
    reconnectTries: Number.MAX_VALUE,
    useNewUrlParser: true,
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
    const users1 = managementClientInstance.getUsers({
      per_page: 100,
      page: 0
    })

    const users2 = managementClientInstance.getUsers({
      per_page: 100,
      page: 1
    })

    Promise.all([users1, users2]).then(function(users) {
        const allUsers = users[0].concat(users[1]);
        res.json(allUsers)
    });

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
        } else {
            res.json(user)
        }
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
            } else {
                res.json(event)
            }
        });
    } else {
        res.send('No event found')
    }
})


var cache = (duration) => {
  return (req, res, next) => {
    let key = '__express__' + req.originalUrl || req.url
    let cachedBody = memorycache.get(key)
    if (cachedBody) {
        res.type('json');   
        res.send(cachedBody)
        return
    } else {
        res.sendResponse = res.send
        res.send = (body) => {
            memorycache.put(key, body, duration * 1000);
            res.type('json');
            res.sendResponse(body)
      }
      next()
    }
  }
}

app.get('/api/public/501stcostumes', cache(56400), (req, res) => {
    const url = 'https://www.501st.com/memberAPI/v3/garrisons/31/members/costumes';
        request(url, (error, response, body) => {
            res.json(JSON.parse(body))
        })
})

app.get('/api/private/events', authCheck, (req, res) => {
    var userSub = jwtDecode(req.headers.authorization)
    const isDgEvent = userSub['http://iris.501st.nl/claims/permissions'].includes('view:dgevents');
    const isDsbEvent = userSub['http://iris.501st.nl/claims/permissions'].includes('view:dsbevents');

    let today = new Date()
    today = today.setDate(today.getDate() - 1);
    Event.find(
        {
            $or:
                [
                    {'groupDutchGarrison': isDgEvent},
                    {'groupDuneSeaBase': isDsbEvent},
                ],
            'eventDates.date': {
                $gte: today
            },
            'isArchived': false
        },
        function (err, events) {
            if (err) {
                res.send(err)
            } else {
                res.json(events)
            }
        }
    )
})

app.get('/api/private/archivedevents', authCheck, (req, res) => {
    let today = new Date()
    today = today.setDate(today.getDate() - 1);
    var userSub = jwtDecode(req.headers.authorization)
    const isDgEvent = userSub['http://iris.501st.nl/claims/permissions'].includes('view:dgevents');
    const isDsbEvent = userSub['http://iris.501st.nl/claims/permissions'].includes('view:dsbevents');
    Event.find(
        {
            $and: [
                {
                    $or:
                        [
                            {'isArchived': true},
                            {'eventDates.date': {
                                    $lt: today
                                }
                            }
                        ]
                },
                {
                    $or:
                        [
                            {'groupDutchGarrison': isDgEvent},
                            {'groupDuneSeaBase': isDsbEvent}
                        ]
                }
            ]
        },
        function (err, events) {
            if (err) {
                res.send(err)
            } else {
                res.json(events)
            }
        }
    )
})

app.get('/api/private/signedupevents', authCheck, (req, res) => {
    var userSub = jwtDecode(req.headers.authorization).sub
    let today = new Date()
    today = today.setDate(today.getDate() - 1);
    Event.find(
        {
            'eventDates.signedUpUsers.userId': userSub,
            'isArchived': false,
            'eventDates.date': {
                $gt: today
            }
        },
        function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/signedupeventsforuser', authCheck, (req, res) => {
    let today = new Date()
    today = today.setDate(today.getDate() - 1);
    Event.find(
        {
            'eventDates.signedUpUsers.userId': req.headers.userid,
            'isArchived': false,
            'eventDates.date': {
                $gt: today
            }
        },
        function (err, events) {
        if (err) {
            res.send(err)
        }
        res.json(events)
    })
})

app.get('/api/private/event', authCheck, (req, res) => {
    Event.findById(req.headers.id, function (err, event) {
        if (err) {
            res.send(err)
        } else {
            res.json(event)
        }
    })
})


app.post('/api/private/event', authCheck, (req, res) => {
    let event = new Event(req.body)

    event.save(function (err) {
        if (err) {
            return res.send(err)
        } else {
            res.json({message: 'Event successfully added!'})
        }
    })
})

app.put('/api/private/event', authCheck, (req, res) => {
    let changedEvent = new Event(req.body)
    Event.findOneAndUpdate({'_id': changedEvent._id}, req.body, {upsert: true}, function (err, doc) {
        if (err) {
            return res.send(err)
        } else {
            res.json({success: true})
        }
    })
})

app.delete('/api/private/event', authCheck, (req, res) => {
    const id = req.query.id
    Event.findByIdAndRemove(id, function(err) {
        if (err) {
            return res.send(err)
        } else {
            res.json({success: true})
        }
    })
})

app.put('/api/private/event/signup', authCheck, (req, res) => {
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
            } else {
                res.json({success: true})
            }
        })
    })
})

app.put('/api/private/event/signupguest', authCheck, (req, res) => {
    Event.findById(req.body.eventId, function (err, event) {
        event.eventDates[req.body.eventDatesIndex].guests.push(req.body.guestName)
        event.save(function (err) {
            if (err) {
                return res.send(err)
            } else {
                res.json({success: true})
            }
        })
    })
})

app.post('/api/private/event/signout', authCheck, (req, res) => {
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
                } else {
                    res.json({message: 'You have been signed out!'})
                }
            })
        })
    } else {
        console.log(`User ID from signed up user ${req.body.userId} does not match that from JWT ${userSub}`)
    }
})

app.post('/api/private/event/change-costume', authCheck, (req, res) => {
    var userSub = jwtDecode(req.headers.authorization).sub

    if (userSub === req.body.userId) { // check if front-end user ID matched the JWT user ID
        Event.findById(req.body.eventId, function (err, event) {
            for (const user of event.eventDates[req.body.eventDateIndex].signedUpUsers) {
                if (req.body.userId === user.userId) {
                    if (req.body.avatar) {
                        user.avatar = req.body.avatar;
                    }
                    user.costume = req.body.changedCustome
                }
            }
            event.save(function (err) {
                if (err) {
                    return res.send(err)
                } else {
                    res.json({message: 'Your costume has been changed!'})
                }
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
        } else {
            res.json(costumes)
        }
    })
})

app.post('/api/private/costumes', authCheck, (req, res) => {
    let costume = new Costume(req.body)
    costume.save(function (err) {
        if (err) {
            return res.send(err)
        } else {
            res.json({message: 'Costume successfully added!'})
        }
    })
})

app.post('/api/private/email', authCheck, (req, res) => {
    Event.findById(req.body.id, function (err, event) {
        if (event) {
            const users1 = managementClientInstance.getUsers({
              per_page: 100,
              page: 0
            })

            const users2 = managementClientInstance.getUsers({
              per_page: 100,
              page: 1
            })

            Promise.all([users1, users2]).then(function(users) {
                const allUsers = users[0].concat(users[1]);

                if (err) {
                    console.log(err)
                    return false
                }
                if (!allUsers) {
                    console.error('No users found!')
                    return false
                }
                const emails = [];
                
                for (const user of allUsers) {
                    if (
                        event.groupDutchGarrison === true && 
                        user && 
                        user.app_metadata && 
                        user.app_metadata.authorization && 
                        user.app_metadata.authorization.permissions && 
                        user.app_metadata.authorization.permissions.includes('signup:dgevent')
                    ) {
                        if (user.email_verified && user.user_metadata.username) {
                            emails.push(user.email);
                        }
                    } else if (
                        event.groupDuneSeaBase === true && 
                        user && 
                        user.app_metadata && 
                        user.app_metadata.authorization && 
                        user.app_metadata.authorization.permissions && 
                        user.app_metadata.authorization.permissions.includes('signup:dsbevent')
                    ) {
                        if (user.email_verified && user.user_metadata.username) {
                            emails.push(user.email);
                        }
                    }
                }

                const data = {
                  html: req.body.html,
                  description: event.description,
                  eventId: req.body.id,
                  title: event.name,
                  users: emails
                };

                var request = require('request');

                request.post({
                        url: process.env.IRIS_MAIL_URL,
                        form: data
                    },
                    function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            res.json(body)
                        }
                    }
                );

            });
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

