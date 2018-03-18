'use strict';
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const EventSchema = new Schema({
    name: String,
    description: String,
    // allegiances: {
    //     type: [String],
    //     enum: ['Dutch Garrison', 'Dune Sea Base'],
    //     required: true
    // },
    eventDates: [{
        date: {
            type: Date,
            required: true
        },
        availableSpots: {
            type: Number
        },
        signedUpUsers: [
            {
                username: {
                    type: String,
                    required: true
                },
                signUpDate: {
                    type: Date,
                    required: true
                },
                costume: {
                    type: String,
                    required: true
                },
                userId: {
                    type: String,
                    required: true
                },
                avatar: {
                    type: String,
                    required: false
                }
            }
        ],
        cancelledUsers: [
            {
                username: {
                    type: String,
                    required: true
                },
                signUpDate: {
                    type: Date,
                    required: true
                },
                costume: {
                    type: String,
                    required: true
                },
                userId: {
                    type: String,
                    required: true
                },
                signoutReason: {
                    type: String,
                    required: true
                }
            }
        ],
        guests: [
            {
                type: String,
                required: true
            }
        ],
        open: Boolean
    }],
    gatherTime: {
        type: String,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    maxSignupDate: {
        type: Date,
        required: true
    },
    eventCoordinator: String,
    street: String,
    postcode: String,
    houseNumber: String,
    city: {
        type: String,
        required: true
    },
    forumUrl: String,
    facebookEvent: String,
    websiteUrl: String,
    publiclyAccessible: Boolean,
    dressingroomAvailable: Boolean,
    travelRestitution: Boolean,
    parking: Boolean,
    parkingRestitution: Boolean,
    lunch: Boolean,
    drinks: Boolean,
    canRegisterGuests: Boolean,
    isArchived: Boolean,
    blastersAllowed: Boolean
})

module.exports = mongoose.model('Event', EventSchema)
