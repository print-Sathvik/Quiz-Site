/* eslint-disable no-unused-vars */
const express = require("express");
var csrf = require("tiny-csrf");
const app = express();
const {
  Admin,
  Quiz,
  User,
  Question,
  Response,
} = require("./models");
const bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");

const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const flash = require("connect-flash");
const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");

const saltRounds = 10;

app.use(bodyParser.json());
const path = require("path");
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("A secret string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));

//Setting EJS as view engine
app.set("view engine", "ejs");

//Location of static html and CSS files to render our application
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: "secret-key for session 123abc",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, //in milli seconds
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

passport.use(
  "AdminAuthenticate",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      Admin.findOne({ where: { email: username } })
        .then(async function (user) {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch(() => {
          return done(null, false, { message: "User does not exist" });
        });
    }
  )
);

passport.use(
  "UserAuthenticate",
  new LocalStrategy(
    {
      usernameField: "userid",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { userId: username } })
        .then(async function (user) {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch(() => {
          return done(null, false, { message: "User does not exist" });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  if (user.email == undefined) {
    user.dataValues.userType = "voter";
  } else {
    user.dataValues.userType = "admin";
  }
  console.log("Serialising user in session", user);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

app.get(
  "/",
  connectEnsureLogin.ensureLoggedOut({ redirectTo: "/adminHome" }),
  async (request, response) => {
    response.render("index", {
      title: "COSC quiz",
      csrfToken: request.csrfToken(),
    });
  }
);

app.get(
  "/signup",
  connectEnsureLogin.ensureLoggedOut({ redirectTo: "/adminHome" }),
  async (request, response) => {
    response.render("signup", {
      title: "Signup",
      csrfToken: request.csrfToken(),
    });
  }
);

app.post("/admin", async (request, response) => {
  if (request.body.firstName.trim().length === 0) {
    request.flash("error", "First name is mandatory");
    return response.redirect("/signup");
  }
  if (request.body.email.trim().length === 0) {
    request.flash("error", "Email ID is a mandatory field");
    return response.redirect("/signup");
  }
  if (request.body.password.length < 5) {
    request.flash("error", "Password should be of atleast 5 characters");
    return response.redirect("/signup");
  }
  const hashedPassword = await bcrypt.hash(request.body.password, saltRounds);
  try {
    const existingEmail = await Admin.findOne({
      where: { email: request.body.email },
    });
    if (existingEmail !== null) {
      throw "User already exists";
    }
    const user = await Admin.create({
      firstName: request.body.firstName,
      email: request.body.email,
      password: hashedPassword,
    });
    request.login(user, (err) => {
      if (err) {
        console.log(err);
        response.redirect("/signup");
      }
      response.redirect("/adminHome");
    });
  } catch (error) {
    console.log(error);
    request.flash("error", "User already exists. Please Login");
    response.redirect("/login");
  }
});

app.get(
  "/login",
  connectEnsureLogin.ensureLoggedOut({ redirectTo: "/adminHome" }),
  (request, response) => {
    response.render("login", {
      title: "Login",
      formAction: "/session",
      csrfToken: request.csrfToken(),
    });
  }
);

app.post(
  "/session",
  passport.authenticate("AdminAuthenticate", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    response.redirect("/adminHome");
  }
);

app.get(
  "/playerLogin",
  connectEnsureLogin.ensureLoggedOut(),
  (request, response) => {
    response.render("login", {
      title: "Login",
      formAction: "/userSession",
      csrfToken: request.csrfToken(),
    });
  }
);

app.post(
  "/userSession",
  passport.authenticate("UserAuthenticate", {
    failureRedirect: "/playerLogin",
    failureFlash: true,
  }),
  function (request, response) {
    console.log("+++++++++++++++++++++++", global.globalElectionId);
    response.redirect("/quiz");
  }
);

app.get("/quiz", connectEnsureLogin.ensureLoggedIn(), async(request, response) => {
  response.render("playerHome")
})

app.post("/quizFind", connectEnsureLogin.ensureLoggedIn(), async(request, response) => {
  response.redirect(`/quiz/${request.body.quizKey}`);
})

app.get(
  "/adminHome",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInUserId = request.user.id;
    const loggedInUser = await Admin.findByPk(loggedInUserId);
    const allQuiz = await Quiz.findAll({ where: {adminId: loggedInUserId}});
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    if (request.accepts("html")) {
      response.render("adminHome", {
        title: "COSC Quiz",
        firstName: loggedInUser.firstName,
        allQuiz,
        csrfToken: request.csrfToken(),
      });
    } else {
      response.json({
        allQuiz,
      });
    }
  }
);

app.get("/quiz/new", connectEnsureLogin.ensureLoggedIn(), async(request, response) => {
  response.render("newQuiz", {
    csrfToken: request.csrfToken()
  });
})

app.post(
  "/quiz",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    if (request.body.title.trim().length === 0) {
      request.flash("error", "Title cannot be empty");
      return response.redirect("/adminHome");
    }
    try {
      const election = await Quiz.create({
        title: request.body.title,
        adminId: request.user.id,
        key: request.body.key,
        timer: request.body.timer,
        score: request.body.score,
        penalty: request.body.penalty,
        status: 0
      });
      if (request.accepts("html")) {
        return response.redirect("/adminHome");
      } else {
        return response.json(election);
      }
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.get("/signout", (request, response, next) => {
  request.logout((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  });
});

app.get(
  "/election/:id/status/:chartType(bar|pie|doughnut)",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const electionId = request.params.id;
    const election = await Election.findByPk(electionId);
    const questions = await Question.getQuestions(electionId);
    const totalVoters = await ElectionVoter.count({ where: { electionId } });
    const voted = await Response.votedCount(questions[0].id);
    let options = new Array(questions.length);
    let optionsCount = new Array(questions.length);
    for (let i = 0; i < questions.length; i++) {
      options[i] = await Option.getOptions(questions[i].id);
      optionsCount[i] = await Response.getOptionsCount(
        questions[i].id,
        options[i]
      );
    }
    response.render("progress", {
      questions,
      options,
      optionsCount,
      totalVoters,
      voted,
      electionId,
      chartType: request.params.chartType || "bar",
      message: `Progress of ${election.title}`,
      csrfToken: request.csrfToken(),
    });
  }
);

app.delete(
  "/elections/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    try {
      console.log(request.body);
      await Election.remove(request.params.id, request.user.id); //Added user id to check who is deleting
      return response.json({ success: true });
    } catch (error) {
      return response.status(422).json(error);
    }
  }
);

//To change election from Not started -> Started -> Ended
app.put(
  "/elections/manage/:id/changeStatus",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const election = await Election.findByPk(request.params.id);
    try {
      const updatedElection = await election.changeStatus(
        election.id,
        election.started,
        election.ended
      );
      return response.json(updatedElection);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

//Manage a specific quiz after clicking on 'Manage' in the home page
app.get(
  "/quiz/manage/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const quiz = await Quiz.findByPk(request.params.id);
    response.render("manageQuiz", {
      quizTitle: quiz.title,
      quizId: request.params.id,
      key: quiz.key,
      timer: quiz.timer,
      score: quiz.score,
      penalty: quiz.penalty,
      csrfToken: request.csrfToken(),
    });
  }
);

app.get(
  "/elections/manage/:id/preview",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const electionId = request.params.id;
    const questions = await Question.getQuestions(electionId);
    let options = new Array(questions.length);
    for (let i = 0; i < questions.length; i++) {
      options[i] = await Option.getOptions(questions[i].id);
    }
    response.render("preview", {
      electionId,
      questions,
      options,
      csrfToken: request.csrfToken(),
    });
  }
);

app.get(
  "/elections/manage/:id/manageVoters",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const electionId = request.params.id;
    const voterTableIds = await ElectionVoter.getVoters(electionId);
    const allVoters = await Voter.getVoters(voterTableIds);
    response.render("manageVoters", {
      electionId: electionId,
      allVoters,
      csrfToken: request.csrfToken(),
    });
  }
);

//Add Voters for a particular election
app.post(
  "/addVoter",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const hashedPassword = await bcrypt.hash(request.body.password, saltRounds);
    try {
      const user = await Voter.create({
        voterId: request.body.voterId,
        password: hashedPassword,
      });
      await ElectionVoter.create({
        electionId: request.body.electionId,
        voterId: user.id,
      });
      if (request.accepts("html")) {
        return response.redirect(
          `/elections/manage/${request.body.electionId}/manageVoters`
        );
      } else {
        return response.json(user);
      }
    } catch (error) {
      console.log(error);
      request.flash(
        "error",
        "This voter ID already exists, please give a diferent ID"
      );
      response.redirect(
        `/elections/manage/${request.body.electionId}/manageVoters`
      );
    }
  }
);

app.get(
  "/elections/manage/:id/newQuestion",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const electionId = request.params.id;
    const questions = await Question.getQuestions(electionId);
    let options = new Array(questions.length);
    for (let i = 0; i < questions.length; i++) {
      options[i] = await Option.getOptions(questions[i].id);
    }
    response.render("addQuestion", {
      electionId,
      questions,
      options,
      csrfToken: request.csrfToken(),
    });
  }
);

app.post(
  "/addQuestion",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const option1 = request.body.option1;
    const option2 = request.body.option2;
    if (option1.trim().length === 0 || option2.trim().length === 0) {
      request.flash("error", "Options cannot be empty");
      return response.redirect(
        `/elections/manage/${request.body.electionId}/newQuestion`
      );
    }
    try {
      const newQuestion = await Question.create({
        title: request.body.title,
        description: request.body.description,
        electionId: request.body.electionId,
      });

      let i = 1;
      let opt = eval(`request.body.option${i}`);
      while (opt != undefined) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else if (opt.trim().length == 0) {
          throw "Options cannot be empty and there should be atleast 2 options";
        }
        i++;
      }

      for (let i = 1; ; i++) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else {
          await Option.create({
            option: opt,
            questionId: newQuestion.id,
          });
        }
      }
      request.flash("success", "Question added Successfully");
      return response.redirect(
        `/elections/manage/${request.body.electionId}/manageQuestions`
      );
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      response.redirect(
        `/elections/manage/${request.body.electionId}/newQuestion`
      );
    }
  }
);

app.get(
  "/elections/manage/:id/manageQuestions",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const electionId = request.params.id;
    const election = await Election.findByPk(request.params.id);
    try {
      if (election.started == true) {
        throw "Election has started. You cannot modify the questions now";
      }
      const questions = await Question.getQuestions(electionId);
      let options = new Array(questions.length);
      for (let i = 0; i < questions.length; i++) {
        options[i] = await Option.getOptions(questions[i].id);
      }
      response.render("manageQuestions", {
        electionId,
        questions,
        options,
        csrfToken: request.csrfToken(),
      });
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      response.redirect(`/elections/manage/${electionId}`);
    }
  }
);

app.get(
  "/questions/manage/:questionid/editQuestion",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const questionId = request.params.questionid;
    const question = await Question.findByPk(questionId);
    const options = await Option.getOptions(questionId);
    response.render("editQuestion", {
      question,
      options,
      csrfToken: request.csrfToken(),
    });
  }
);

app.post(
  "/updateQuestion",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    try {
      await Question.update(
        {
          title: request.body.title,
          description: request.body.description,
        },
        {
          where: {
            id: request.body.questionId,
          },
        }
      );

      //Validating
      let i = 1;
      let opt = eval(`request.body.option${i}`);
      while (opt != undefined) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else if (opt.trim().length == 0) {
          throw "Options cannot be empty";
        }
        i++;
      }

      await Option.remove(request.body.questionId);
      for (let i = 1; ; i++) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else {
          await Option.create({
            option: opt,
            questionId: request.body.questionId,
          });
        }
      }
      request.flash("success", "Question Updated Successfully");
      return response.redirect(
        `/elections/manage/${request.body.electionId}/manageQuestions`
      );
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      return response.redirect(
        `/questions/manage/${request.body.questionId}/editQuestion`
      );
    }
  }
);

app.post(
  "/questions/manage/:id/launch",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const election = await Election.findByPk(request.params.id);
    try {
      const updatedElection = await election.changeStatus(
        election.id,
        election.started,
        election.ended
      );
      return response.redirect("/adminHome");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.delete(
  "/questions/manage/:questionId",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    await Option.remove(request.params.questionId);
    //Deleting the options for the deleted question

    await Question.destroy({
      where: {
        id: request.params.questionId,
      },
    });

    return response.json({ success: true });
  }
);

app.post(
  "/addCustomURL",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const electionId = request.body.electionId;
    const url = request.body.customURL;
    try {
      const isnum = /^\d+$/.test(url);
      if (isnum) {
        throw "Custom URL connot be entirely of numbers. Add other characters also";
      }
      if (url.indexOf(" ") >= 0) {
        throw "White spaces should not be there";
      }
      const newurl = await Url.create({
        electionId: electionId,
        customURL: url,
      });
      response.redirect(`/elections/manage/${electionId}`);
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      response.redirect(`/elections/manage/${electionId}`);
    }
  }
);

app.get("/vote/election/:id", async (request, response) => {
  const isnum = /^\d+$/.test(request.params.id);
  try {
    let election, electionId;
    if (isnum) {
      election = await Election.findByPk(request.params.id);
      electionId = request.params.id;
      if (election == null) {
        throw "No election with such URL";
      }
    } else {
      const customURL = request.params.id;
      const url = await Url.findOne({ where: { customURL: customURL } });
      if (url == null) {
        throw "No election with such URL";
      }
      electionId = url.electionId;
      election = await Election.findByPk(electionId);
    }
    global.globalElectionId = electionId;

    if (election.started == true && election.ended == true) {
      response.redirect(`/vote/${electionId}/bar`);
    } else {
      response.redirect(`/vote/${electionId}`);
    }
  } catch (error) {
    console.log(error);
    request.flash("error", error);
    response.redirect("/");
  }
});

app.get("/vote/:id/:chartType(bar|pie|doughnut)", async (request, response) => {
  const isnum = /^\d+$/.test(request.params.id);
  try {
    let election, electionId;
    if (isnum) {
      election = await Election.findByPk(request.params.id);
      electionId = request.params.id;
      if (election == null) {
        throw "No election with such URL";
      }
    } else {
      const customURL = request.params.id;
      const url = await Url.findOne({ where: { customURL: customURL } });
      if (url == null) {
        throw "No election with such URL";
      }
      electionId = url.electionId;
      election = await Election.findByPk(electionId);
    }

    if (election.started == true && election.ended == true) {
      const election = await Election.findByPk(electionId);
      const questions = await Question.getQuestions(electionId);
      let options = new Array(questions.length);
      let optionsCount = new Array(questions.length);
      for (let i = 0; i < questions.length; i++) {
        options[i] = await Option.getOptions(questions[i].id);
        optionsCount[i] = await Response.getOptionsCount(
          questions[i].id,
          options[i]
        );
      }
      response.render("result", {
        questions,
        options,
        optionsCount,
        electionId,
        chartType: request.params.chartType,
        message: `Results of ${election.title}`,
        csrfToken: request.csrfToken(),
      });
    } else {
      throw "Election is not yet over";
    }
  } catch (error) {
    console.log(error);
    request.flash("error", error);
    response.redirect("/");
  }
});

app.get(
  "/vote/:id",
  connectEnsureLogin.ensureLoggedIn({
    redirectTo: "/playerLogin",
    setReturnTo: true,
  }),
  async (request, response, next) => {
    if (request.user.userType == "admin") {
      request.flash("error", "Admin cannot access voter page");
      return response.redirect("/adminHome");
    }
    const electionId = request.params.id;
    const election = await Election.findByPk(electionId);
    const questions = await Question.getQuestions(electionId);
    let options = new Array(questions.length);
    for (let i = 0; i < questions.length; i++) {
      options[i] = await Option.getOptions(questions[i].id);
    }
    if (election.started == true && election.ended == false) {
      if (await Response.isResponded(questions[0].id, request.user.id)) {
        response.render("result", {
          message: "You have already voted. Please wait for the result",
          csrfToken: request.csrfToken(),
        });
      } else {
        response.render("castVote", {
          electionId,
          questions,
          options,
          message: "The questions will appear here",
          csrfToken: request.csrfToken(),
        });
      }
    } else if (election.started == false) {
      response.render("result", {
        message: "Election has not yet started",
        csrfToken: request.csrfToken(),
      });
    }
  }
);

app.post(
  "/addVote",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "admin") {
      request.flash("error", "Admin cannot access voter page");
      return response.redirect("/adminHome");
    }
    const electionId = request.body.electionId;
    const questions = await Question.getQuestions(electionId);
    for (let i = 0; i < questions.length; i++) {
      await Response.create({
        questionId: questions[i].id,
        voterId: request.user.id,
        optionId: eval(`request.body.option${i + 1}`),
      });
    }
    response.redirect(`/vote/${electionId}`);
  }
);

module.exports = app;
