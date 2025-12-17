const express = require('express') // web framework

const morgan = require('morgan') // logger middleware

const rateLimit = require('express-rate-limit')

const helmet = require('helmet') // security middleware

const mongoSanitize = require('express-mongo-sanitize') // prevent nosql injection

const bodyParser = require('body-parser') // parse request body

const app = express()

module.exports = app