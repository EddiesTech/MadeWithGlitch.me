const express = require("express");
const app = express();
const sanitizer = require('sanitizer');
const mongoose = require('mongoose');
const nodemailer = require("nodemailer");
const popupTools = require('popup-tools');
const fetch = require("node-fetch");
mongoose.set('useCreateIndex', true)
mongoose.set('useFindAndModify', false);
app.set("view engine", "ejs")
app.use(express.static("views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function checkHttps(req, res, next){
  if(req.get('X-Forwarded-Proto').indexOf("https")!=-1){
    return next()
  } else {
    res.redirect('https://' + req.hostname + req.url);
  }
}

app.all('*', checkHttps)

function checkUrl(req, res, next){
  var host = req.get('host');
    if (host=="madewith.glitch.me") return res.redirect("//madewithglitch.me"+req.originalUrl)
  return next();
}

app.all('*', checkUrl)

const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
const PORT = 5000;

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        store: new MongoStore({ mongooseConnection: mongoose.connection })
    })
);

const UserSchema = new mongoose.Schema(
    {
        username: {
            type: String
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
      verified: {
        type: Boolean
      },
      token:{
        type: String
      }
    }
);
const User = mongoose.model("users", UserSchema);

const SubmissionsSchema = new mongoose.Schema(
    {
        projectname: {
            type: String
        },
      projecturl: {
            type: String,
        },
      projectdescription:{
        type: String
      },
      longdescription:{
        type: String
      },
      githuburl:{
        type: String
      },
        email: {
            type: String,
        },
      name: {
      type: String
    },
      published:{
        type: Boolean,
        default: false
      }
    }
);
const Submission = mongoose.model("submissions", SubmissionsSchema);

const ReportSchema = new mongoose.Schema(
    {
      projectid: {
            type: String,
        },
      description:{
        type: String
      },
        email: {
            type: String,
        },
      name: {
      type: String
    }
    }
);
const Report = mongoose.model("reports", ReportSchema);

const passport = require("passport")
var GitHubStrategy = require('passport-github').Strategy;
passport.serializeUser((user, done) => {
    done(null, user.id);
  
});

passport.deserializeUser((id, done) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
  User.findById(id, (err, user) => {
        done(err, user);
    });
}else{
  done(null, false);
}
});
passport.use('github',new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "https://madewithglitch.me/auth/github",
  scope: 'user:email'
  }, (res, accessToken, refreshToken, profile, done)=>{
          User.findOne({ email: profile.emails["0"].value })
            .then(user => {
                // Create new User
                if (!user) {
                  require("crypto").randomBytes(48, function(err, buffer) {
            var token = buffer.toString("hex");
                    new User({
                      username: sanitizer.escape(profile.username),
                      email: sanitizer.escape(profile.emails["0"].value),
                      verified: false,
                      token: token
                      
                    }).save(function(err, exists) {
              if (err) {
                console.log(err);
              } else {
                console.log("user created!");
                async function main(){
                let transporter = nodemailer.createTransport({
                  host: 'smtp.sendgrid.net',
                  port: 587,
                  secure: false,
                  ignoreTLS: true,
                  auth: {
                    user: "apikey",
                    pass: process.env.EMAILPASS
                  }
                });
                  // send mail with defined transport object
                let info = await transporter.sendMail({
                  from: 'MadeWithGlitch.me <noreply@madewithglitch.me>', // sender address
                  to: "contact@eddiestech.co.uk, trent@riverside.rocks",
                  subject: "New User Verification - MadeWithGlitch.me", // Subject line
                  html: "<b>New MadeWithGlitch.me user!</b><br />Username: "+sanitizer.escape(profile.username)+"<br/>Email: "+sanitizer.escape(profile.emails[0].value)+"<br />Is this user trusted?<br /><a href='https://madewithglitch.me/verify/"+token+"'>Yes - give them access to the admin section!</a> or <a href='https://madewithglitch.me/dontverify/"+token+"'>No - delete their account!</a>"
                });
                }
                main().catch(console.error);
                }
                return done(null, false, { message: "Please wait for verification! This can take some time! Check your emails for a confirmation message to know when it's done! Until then, you can always browse the site." });
                    })
                  })
              } else {
                if(!user.verified) return done(null, false, {message: "not verified"})           
                return done(null, user);
                        } 
                    })
            .catch(err => {
                return done(null, false, { message: err });
            });
}
  ))
app.use(passport.initialize());
app.use(passport.session());
  app.get('/auth/github', 
  passport.authenticate('github', { failureRedirect: '/adminlogin/?notverified',successRedirect:'/adminarea' }));
  app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/adminlogin');
});

passport.use('githubpopup',new GitHubStrategy({
    clientID: process.env.GITHUB_SUBMITFORM_CLIENT_ID,
    clientSecret: process.env.GITHUB_SUBMITFORM_CLIENT_SECRET,
    callbackURL: "https://madewithglitch.me/submit/githubauth",
  scope: 'user public_repo'
  }, (res, accessToken, refreshToken, user, done)=>{
  return done(null, user)
}))
app.get('/popup-url', passport.authenticate('githubpopup'))
app.get('/submit/githubauth', 
    passport.authenticate('githubpopup'),
    function (req, res) {
  console.log(req.user)
  console.log(req.user._json.repos_url)
  fetch(req.user._json.repos_url)
  .then(res => res.json())
    .then(json => res.end(popupTools.popupResponse(json)));
    })

app.get("/", (request, response) => {
  Submission.find({published: true}, (err, doc)=>{
    response.render("index", {doc: doc});
  })
});

app.get("/adminlogin", (req,res)=>{
  res.render("login")
})
app.get("/adminarea", (req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{res.render("adminarea")}
})

app.get("/submit", (req,res)=>{
  res.render("submit")
})

app.post("/submit", (req,res)=>{
  new Submission({
    projectname: sanitizer.escape(req.body.projectname),
    projecturl: sanitizer.escape(req.body.projecturl).replace(/(^\w+:|^)\/\//, ""),
    projectdescription: sanitizer.escape(req.body.shortdescription),
    longdescription: sanitizer.escape(req.body.projectdescription),
    githuburl: sanitizer.escape(req.body.githubrepo),
    name: sanitizer.escape(req.body.name),
    email: sanitizer.escape(req.body.email),
    published: false
                    }).save(function(err, doc) {
              if (err) {
                console.log(err);
              } else {
                res.redirect("thanksforsubmitting/"+doc._id)
                console.log("submission created!");
                async function main(){
                let transporter = nodemailer.createTransport({
                  host: 'smtp.sendgrid.net',
                  port: 587,
                  secure: false,
                  ignoreTLS: true,
                  auth: {
                    user: "apikey",
                    pass: process.env.EMAILPASS
                  }
                });
                  // send mail with defined transport object
                let info = await transporter.sendMail({
                  from: 'MadeWithGlitch.me <noreply@madewithglitch.me>', // sender address
                  to: "contact@eddiestech.co.uk, trent@riverside.rocks",
                  subject: "New Submission - MadeWithGlitch.me", // Subject line
                  html: "<b>New MadeWithGlitch.me submission!</b><br />Full Name: "+sanitizer.escape(req.body.name)+"<br />Email Address: <a href='mailto:"+sanitizer.escape(req.body.email)+"'>"+sanitizer.escape(req.body.email)+"</a><hr />Project Name: "+sanitizer.escape(doc.projectname)+"<br />Project URL: "+sanitizer.escape(doc.projecturl).replace(/(^\w+:|^)\/\//, "")+"<br />Description:<br />"+sanitizer.escape(req.body.shortdescription)
                });
                }
                main().catch(console.error);
                async function main2(){
                let transporter = nodemailer.createTransport({
                  host: 'smtp.sendgrid.net',
                  port: 587,
                  secure: false,
                  ignoreTLS: true,
                  auth: {
                    user: "apikey",
                    pass: process.env.EMAILPASS
                  }
                });
                  // send mail with defined transport object
                let info = await transporter.sendMail({
                  from: 'MadeWithGlitch.me <noreply@madewithglitch.me>', // sender address
                  to: req.body.email,
                  subject: "New Submission - MadeWithGlitch.me", // Subject line
                  html: "<b>Thanks for your MadeWithGlitch.me submission!</b><br />Full Name: "+sanitizer.escape(req.body.name)+"<br />Email Address: <a href='mailto:"+sanitizer.escape(req.body.email)+"'>"+sanitizer.escape(req.body.email)+"</a><hr />Project Name: "+sanitizer.escape(doc.projectname)+"<br />Project URL: "+sanitizer.escape(doc.projecturl).replace(/(^\w+:|^)\/\//, "")+"<br />Description:<br />"+sanitizer.escape(req.body.shortdescription)+"<hr />Want to learn more, hop over here: <a href='https://madewithglitch.me/thanksforsubmitting/"+doc._id+"'>madewithglitch.me/thanksforsubmitting/"+doc._id+"</a>!"
                });
                }
                main2().catch(console.error);
              }})})

app.get("/legal", (req,res)=>{
  res.render("legal")
})
app.get("/legal/privacy", (req,res)=>{
  res.render("privacy")
})

app.get("/projects/random", (req,res)=>{
  Submission.find({published: true}, (err, doc)=>{
    res.redirect("/projects/"+doc[Math.floor(Math.random() * doc.length)].projecturl);
  })
})

app.get("/adminarea/submissions", (req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.find({}, (err, doc)=>{
      res.render("submissions",{doc: doc})          
    })}
})

app.get("/adminarea/submissions/:id", (req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.findOne({_id:req.params.id}, (err, doc)=>{
      if(!doc) res.redirect("/adminarea/submissions")
      else res.render("submissionsview",{doc: doc})          
    })}
})

app.get("/adminarea/submissions/edit/:id",(req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.findOne({_id:req.params.id}, (err, doc)=>{
      if(!doc) res.redirect("/adminarea/submissions")
      else res.render("submissionsedit",{doc: doc})          
    })
  }
})
app.post("/adminarea/submissions/edit/:id",(req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.findOne({_id:req.params.id}, (err, doc)=>{
      if(!doc) res.redirect("/adminarea/submissions")
      else{
        Submission.findOneAndUpdate({_id: req.params.id}, {projectname: req.body.projectname, projecturl: req.body.projecturl.replace(/(^\w+:|^)\/\//, ""), projectdescription: req.body.projectdescription},(err,doc)=>{
          if(err) res.send(err)
          else res.redirect('/adminarea/submissions/'+req.params.id)
        })
      }
    })
  }
})

app.get("/adminarea/submissions/publish/:id",(req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.findOne({_id:req.params.id}, (err, doc)=>{
      if(!doc) res.redirect("/adminarea/submissions")
      else{
        Submission.findOneAndUpdate({_id: req.params.id}, {published: true},(err,doc)=>{
          if(err) res.send(err)
          else res.redirect('/projects/'+doc.projecturl)
        })
      }
    })
  }
})
app.get("/adminarea/submissions/delete/:id",(req,res)=>{
  if(!req.user){res.redirect("/adminlogin")}
  else{
    Submission.findOne({_id:req.params.id}, (err, doc)=>{
      if(!doc) res.redirect("/adminarea/submissions")
      else{
        Submission.deleteOne({_id:req.params.id}, (err, doc)=>{
          if(err) res.send(err)
          else res.redirect('/adminarea/submissions')
        })
      }
    })
  }
})

app.get("/projects/:url", (req,res)=>{
  Submission.findOne({projecturl: req.params.url},(err, doc)=>{
    if(!doc) res.redirect("/")
    else{
      if(!doc.published) res.redirect("/")
      else res.render("project",{doc: doc})}
  })
})

app.get("/projects/:url/report", (req,res)=>{
  Submission.findOne({projecturl: req.params.url},(err, doc)=>{
    if(!doc) res.redirect("/")
    else{
      if(!doc.published) res.redirect("/")
      else res.render("report",{doc: doc})}
  })
})

app.post("/projects/:url/report", (req,res)=>{
  Submission.findOne({projecturl: req.params.url}, (err, doc)=>{
    new Report({
    projectid: doc._id,
    description: sanitizer.escape(req.body.description),
    name: sanitizer.escape(req.body.name),
    email: sanitizer.escape(req.body.email),
                    }).save(function(err, exists) {
              if (err) {
                console.log(err);
              } else {
                res.send("Thanks for the report! We'll look into it.")
                console.log("report created!");
                async function main(){
                let transporter = nodemailer.createTransport({
                  host: 'smtp.sendgrid.net',
                  port: 587,
                  secure: false,
                  ignoreTLS: true,
                  auth: {
                    user: "apikey",
                    pass: process.env.EMAILPASS
                  }
                });
                  // send mail with defined transport object
                let info = await transporter.sendMail({
                  from: 'MadeWithGlitch.me <noreply@madewithglitch.me>', // sender address
                  to: "contact@eddiestech.co.uk, trent@riverside.rocks",
                  subject: "New Project Report - MadeWithGlitch.me", // Subject line
                  html: "<b>New MadeWithGlitch.me report!</b><br />Full Name: "+sanitizer.escape(req.body.name)+"<br />Email Address: <a href='mailto:"+sanitizer.escape(req.body.email)+"'>"+sanitizer.escape(req.body.email)+"</a><hr />Reporting: "+doc.projectname+"<br />Report Description:<br />"+sanitizer.escape(req.body.description)
                });
                }
                main().catch(console.error);
              }})
    
  })
})

app.get("/dontverify/:token", (req,res)=>{
  User.deleteOne({token: req.params.token}, function (err, _) {
                if (err) {
                    return console.log(err);
                }
            });
  res.send("Deleted user. You may now close this tab :)")
})
app.get("/verify/:token", (req,res)=>{
  User.findOneAndUpdate({token: req.params.token},{verified: true}, (err, doc) => {
                if (err) {
                    console.log(err);
                }else{
  async function main(doc){
    console.log(doc.email)
                let transporter = nodemailer.createTransport({
                  host: 'smtp.sendgrid.net',
                  port: 587,
                  secure: false,
                  ignoreTLS: true,
                  auth: {
                    user: "apikey",
                    pass: process.env.EMAILPASS
                  }
                });
                  // send mail with defined transport object
                let info = await transporter.sendMail({
                  from: 'MadeWithGlitch.me <noreply@madewithglitch.me>', // sender address
                  to: doc.email,
                  subject: "You Are Verified! - MadeWithGlitch.me", // Subject line
                  html: "<b>Your MadeWithGlitch.me account is verified!</b><br />You can now login at <a href='https://madewithglitch.me/adminlogin'>madewithglitch.me</a>!"
                });
          res.send("Verified user. You may now close this tab :)")
                }
                main(doc).catch(console.error);
                  
                }
  })

})
app.get("/thanksforsubmitting/:id", (req,res)=>{
  res.render("thanksforsubmitting")
})

mongoose.connect(process.env.MONGODB_CONNECTION_STRING,{ useUnifiedTopology: true, useNewUrlParser: true },(err) => {
  console.log('mongodb connected');
  if(err){console.log(err)}
})

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});