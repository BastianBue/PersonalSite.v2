require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const _ = require("lodash")
const app = express();
const session = require('express-session');
const https = require("https");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
const findOrCreate = require("mongoose-findorcreate")
const nodemailer = require("nodemailer");
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// mongoose Code...........................................................

mongoose.connect(
  process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
  });


mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  facebookId: String,
  secret: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User', userSchema);

passport.use(User.createStrategy());
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      googleId: profile.id
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      facebookId: profile.id
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

// mongoose Code...........................................................


// server Code ...................................................................

app.get("/", function(req, res) {
  res.render("home", {});
})
app.post("/", function(req, res) {

  // this will catch the data
  const firstName = req.body.firstName;
  const lastName = req.body.secondName;
  const email = req.body.email;

  // this organizes the data in a way that the mailchimp api can process
  var data = {
    members: [{
      email_address: email,
      status: "subscribed",
      merge_fields: {
        FNAME: firstName,
        LNAME: lastName
      }
    }]
  };

  // mailchimp can only recieve JSON stringified data
  const jsonData = JSON.stringify(data);

  // this is were the data will be posted and how
  const url = "https://us10.api.mailchimp.com/3.0/lists/c141f14330"
  const options = {
    method: "post",
    auth: "bastian:e130bef0782f94f101b51d207ce4d02f-us10"
  }

  // this posts the data to mailchimp
  const request = https.request(url, options, function(response) {
    console.log(response.statusCode);
    if (response.statusCode === 200) {
      res.redirect("/");
    } else {
      res.redirect("/");
    }
  });
  request.write(jsonData);
  request.end();

});




// secrets Code ...................................................................

app.get("/secrets", function(req, res) {
  res.render("secrets/home");
})

app.route("/secrets/login")
  .get(function(req, res) {
    res.render("secrets/login");
  })
  .post(function(req, res) {
    const user = new User({
      email: req.body.username,
      password: req.body.password,
    });
    req.login(user, function(err) {
      if (err) {
        console.log(err);
      } else {
        passport.authenticate("local",{failureRedirect:"/secrets/login"})(req, res, function() {
          res.redirect("/secrets/secrets")
        });
      }
    });
  });

app.route("/secrets/register")
  .get(function(req, res) {
    res.render("secrets/register");
  })
  .post(function(req, res) {
    User.register({
      username: req.body.username
    }, req.body.password, function(err, user) {
      if (err) {
        console.log(err);
        res.redirect("/secrets/register")
      } else {
        passport.authenticate("local")(req, res, function() {
          res.redirect("/secrets/secrets")
        });
      }
    })
  });

app.route("/secrets/submit")
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      res.render("secrets/submit")
    } else {
      res.redirect("/secrets/login")
    }
  })
  .post(function(req, res) {
    const submittedSecret = req.body.secret;
    User.findById(req.user.id, function(err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          foundUser.secret = submittedSecret;
          foundUser.save();
          res.redirect("/secrets/secrets")
        }
      }
    });
  });


app.get("/secrets/secrets", function(req, res) {
  User.find({
    "secret": {
      $ne: null
    }
  }, function(err, foundUsers) {
    if (err) {
      console.log(err);
    } else {
      if (foundUsers) {

        if (req.isAuthenticated()) {
          res.render("secrets/secrets", {
            usersWitchSecrets: foundUsers,
            status: "loggedIn"
          })
        } else {
          res.render("secrets/secrets", {
            usersWitchSecrets: foundUsers,
            status: "notLoggedIn"
          })
        }
      }
    }
  })
})

app.get("/secrets/logout", function(req, res) {
  req.logout();
  res.redirect("/secrets");
});

app.get("/secrets/whatever", function(req, res) {
  res.render("secrets/whatever");
});


app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile']
}));

app.get("/auth/google/secrets",
  passport.authenticate('google', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    res.redirect('/secrets');
  });

app.get('/auth/facebook', passport.authenticate('facebook'));

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    res.redirect('/secrets');
  });


// mail-form ...................................................................
app.post("/mail", function(req, res) {

  const receiver = "b.bueld@gmx.de";
  const nameAndMail = req.body.name + "<" + req.body.email + ">";
  const subject = req.body.subject;
  const message = req.body.message;

  mongoose.connect(
    process.env.DATABASE_TWO, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false
    });
  const mailSchema = new mongoose.Schema({
    email: String,
    subject: String,
    message: String
  });

  const Mail = mongoose.model('Mail', mailSchema);

  const newMail = new Mail({
    email: nameAndMail,
    subject: subject,
    message: message
  });
  newMail.save();

  async function main() {

    let transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.NODEMAIL_USER, // generated ethereal user
        pass: process.env.NODEMAIL_PASSWORD, // generated ethereal password
      },
    });
    let mail = await transporter.sendMail({
      from: nameAndMail, // sender address
      to: receiver, // list of receivers
      subject: subject, // Subject line
      text: message, // plain text body
      html: "<p>" + message + "</p>"
    });
    console.log("Message sent: %s", info.messageId);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
  }
  main().catch(console.error);
  res.redirect("/contactSucces")
});
app.get("/contactSucces", function(req, res) {
  res.render("contactSucces")
})

//run server ...................................................................
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port, function() {
  console.log("server up and running");
});
