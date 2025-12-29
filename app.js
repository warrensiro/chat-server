const express = require("express"); // web framework

const routes = require("./routes/index"); // get all the routes

const morgan = require("morgan"); // logger middleware

const rateLimit = require("express-rate-limit");

const helmet = require("helmet"); // security middleware

const mongoSanitize = require("express-mongo-sanitize"); // prevent nosql injection

// const bodyParser = require("body-parser"); // parse request body

const xss = require("xss"); //prevent xss attacks

const cors = require("cors");

const app = express();

app.use(express.json({ limit: "10kb" }));

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(mongoSanitize({
  replaceWith: '_',
  sanitizeQuery: false, //avoids express getter issue
})); // to prevent nosql injection

// app.use(xss())

// next is to add other middlewares1
app.use(
  cors({
    origin: true,
    methods: ["GET", "PATCH", "PUT", "DELETE", "POST"],
    credentials: true,
  })
);


// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ encoded: true }));
app.use(helmet());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// to avoid crashing the server with too many requests
const limiter = rateLimit({
  max: 1000,
  windowMs: 60 * 60 * 1000,
  message: "Try again in an hour",
});

app.use("/siro", limiter); // apply rate limiting to all requests starting with /siro

// app.post("/ping", (req, res) => {
//   res.json({ pong: true });
// });


app.use(routes);

module.exports = app;
