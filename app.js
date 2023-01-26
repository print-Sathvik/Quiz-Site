const express = require("express");
var csrf = require("tiny-csrf");
const app = express();
const {
  Admin,
  Quiz,
  User,
  Question,
  Response
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
          //const result = await bcrypt.compare(password, user.password);
          console.log(password, user, user.password);
          if (password == user.password) {
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
  "/userLogin",
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
    failureRedirect: "/userLogin",
    failureFlash: true,
  }),
  function (request, response) {
    response.redirect("/quiz");
  }
);

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
        let quiz = await Quiz.findOne({ where: {key: request.body.key}});
        if(quiz != null) {
            throw "This key is currently in use by other quiz. Try some other key"
        }
        quiz = await Quiz.create({
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
        return response.json(quiz);
      }
    } catch (error) {
      console.log(error);
      return response.redirect("/quiz/new");
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

//To change quiz from Not started -> Started -> Restart
app.get(
    "/quiz/manage/:id/changeStatus",
    connectEnsureLogin.ensureLoggedIn(),
    async function (request, response) {
      if (request.user.userType == "voter") {
        request.flash("error", "User cannot access that page");
        return response.redirect(request.headers.referer);
      }
      const quiz = await Quiz.findByPk(request.params.id);
      try {
        await quiz.changeStatus(
          quiz.id,
          quiz.status
        );
        return response.redirect("/adminHome");
      } catch (error) {
        console.log(error);
        return response.status(422).json(error);
      }
    }
);

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
  "/quiz/manage/:id/managePlayers",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const quizId = request.params.id;
    const allUsers = await User.findAll({ where: {quizId: quizId } });
    response.render("manageUsers", {
      quizId,
      allUsers,
      csrfToken: request.csrfToken(),
    });
  }
);

app.post(
  "/addUser",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    //const hashedPassword = await bcrypt.hash(request.body.password, saltRounds);
    try {
      const user = await User.create({
        userId: request.body.userId,
        quizId: request.body.quizId,
        password: request.body.password,
      });
      if (request.accepts("html")) {
        return response.redirect(`/quiz/manage/${request.body.quizId}/managePlayers`);
      } else {
        return response.json(user);
      }
    } catch (error) {
      console.log(error);
      request.flash("error", "This user ID already exists, please give a diferent ID");
      response.redirect(`/quiz/manage/${request.body.quizId}/managePlayers`);
    }
  }
);

app.get(
  "/quiz/manage/:id/newQuestion",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    response.render("addQuestion", {
      quizId: request.params.id,
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
    try {
      let i = 1;
      let opt = eval(`request.body.option${i}`);
      while (opt != undefined) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else if (opt.trim().length == 0) {
          throw "Hints cannot be empty";
        }
        i++;
      }
      let appendedHints = "";
      for (let i = 1; ; i++) {
        opt = eval(`request.body.option${i}`);
        if (opt == undefined) {
          break;
        } else {
          appendedHints = appendedHints + opt + "|~|" ;
        }
      }
      await Question.create({
        quizId: request.body.quizId,
        title: request.body.title,
        answer: request.body.answer,
        hints: appendedHints
      });
      request.flash("success", "Question added Successfully");
      return response.redirect(
        `/quiz/manage/${request.body.quizId}/manageQuestions`
      );
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      response.redirect(
        `/quiz/manage/${request.body.quizId}/newQuestion`
      );
    }
  }
);

app.get("/quiz/manage/:id/manageQuestions",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    const quizId = request.params.id;
    const quiz = await Quiz.findByPk(quizId);
    try {
      if (quiz.status == 1) {
        throw "Quiz has started. You cannot modify the questions while the quiz is going on";
      }
      const questions = await Question.findAll({ where: {quizId}});
      response.render("manageQuestions", {
        quizId,
        questions,
        csrfToken: request.csrfToken(),
      });
    } catch (error) {
      console.log(error);
      request.flash("error", error);
      response.redirect(`/quiz/manage/${quizId}`);
    }
  }
);

app.delete("/questions/manage/:questionId", connectEnsureLogin.ensureLoggedIn(), async (request, response) => {
    if (request.user.userType == "voter") {
      request.flash("error", "User cannot access that page");
      return response.redirect(request.headers.referer);
    }
    await Question.destroy({
      where: {
        id: request.params.questionId,
      },
    });
    return response.json({ success: true });
  }
);


app.get("/quiz", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    response.render("playerHome", {
        csrfToken: request.csrfToken()
    })
})

app.post("/findQuiz", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    const quizKey = request.body.quizKey;
    const quiz = await Quiz.findOne({ where: {key: quizKey}});
    try {
        if(quiz == null) {
            throw "Wrong Key";
        }
        response.redirect(`/quiz/${quizKey}/all`);
    } catch (error) {
        console.log(error);
        request.flash("error", error);
        response.redirect(`/quiz`);
    }
});

app.get("/quiz/:quizKey/all", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    const quizKey = request.params.quizKey;
    const quiz = await Quiz.findOne({ where: {key: quizKey}});
    const questions = await Question.findAll( {where: {quizId: quiz.id}});
    response.render("questionList", { 
        questions,
        quizKey,
        csrfToken: request.csrfToken()
    });
})

app.get("/quiz/:quizKey/question/:id", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    const question = await Question.findByPk(request.params.id);
    const quiz = await Quiz.findOne({ where: {key: request.params.quizKey}});
    const userResponse = await Response.findOne({ where: {userId:request.user.id, questionId: request.params.id}});
    let noOfHints = 0;
    if(userResponse != null) {
        noOfHints = userResponse.hintsUsed
    }
    response.render("question", { 
        question,
        quizKey: quiz.key,
        noOfHints,
        csrfToken: request.csrfToken()
    });
})

app.post("/submitAnswer", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    const question = await Question.findByPk(request.body.questionId);
    const quiz = await Quiz.findByPk(question.quizId);
    const answer = request.body.answer
    try {
        if(answer.localeCompare(question.answer, undefined, { sensitivity: 'base' }) != 0) {
            throw "Wrong Answer";
        }
        else {
            const userResponse = await Response.findOne({where: {userId: request.user.id, questionId: request.body.questionId}});
            if(userResponse == null) {
                await Response.create({
                    userId:request.user.id,
                    questionId: request.body.questionId,
                    hintsUsed: 0,
                    status: true
                });
            }
            else if(userResponse.status == false) {
                await Response.update({status:true}, {
                    where: {
                        userId:request.user.id,
                        questionId: request.body.questionId
                    }
                });
            }
            request.flash("success", "Correct answer");
            response.redirect(`/quiz/${quiz.key}/question/${question.id}`);
        }
    } catch(error) {
        console.log(error);
        request.flash("error", error);
        response.redirect(`/quiz/${quiz.key}/question/${question.id}`);
    }
});

app.get("/quiz/:questionId/hint", connectEnsureLogin.ensureLoggedIn({redirectTo: "/userLogin"}), async(request, response) => {
    if (request.user.userType == "admin") {
        request.flash("error", "Admin cannot access player page");
        return response.redirect(request.headers.referer);
    }
    const questionId = request.params.questionId;
    const question = await Question.findByPk(questionId);
    const quiz = await Quiz.findByPk(question.quizId);
    const userResponse = await Response.findOne({ where: {userId:request.user.id, questionId: questionId}});
    try {
        if(userResponse == null) {
            await Response.create({
                userId:request.user.id,
                questionId,
                hintsUsed: 1,
                status: false
            });
        }
        else if(userResponse.status == true) {
            throw "You have already answered this question correctly. So further hints cannot be given"
        }
        else {
            const hints = userResponse.hintsUsed;
            const combinedHints = question.hints;
            const maxHints = (combinedHints.match(/\|~\|/g) || []).length;
            if(userResponse.hintsUsed >= maxHints) {
                throw "No more hints are available";
            }
            await Response.update({hintsUsed: hints+1}, {where: {userId:request.user.id, questionId: questionId}});
        }
        return response.redirect(`/quiz/${quiz.key}/question/${questionId}`);
    } catch(error) {
        console.log(error);
        request.flash("error", error);
        response.status(200);
        response.send(error);
    }
})

module.exports = app;