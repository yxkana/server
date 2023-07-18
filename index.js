const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:5000/notes",
  "http://localhost:5173/notes",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
];

import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { dirname } from "path";
import bodyParser from "body-parser";
import mongoose, { Schema } from "mongoose";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import uniqueString from "unique-string";

const credentials = (req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Credentials", true);
  }
  next();
};
const app = express();
app.use(credentials);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.sendStatus(404);
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCES_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403); //invalid token
    req.email = decoded.email;
    next();
  });
};


mongoose.connect("mongodb+srv://kavalekdaniel01:"+process.env.DB_PASSWORD+"@cluster0.xwtmbma.mongodb.net/?retryWrites=true&w=majority");

const noteSchema = new Schema({
  title: String,
  content: String,
  priority: String,
  tags: Array,
  status: String,
  creator: String,
});

const projectSchema = new Schema({
  title: String,
  desc: String,
  team: Array,
  tasks: Array,
  todoStatus: Number,
  progressStatus: Number,
  completeStatus: Number,
});

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  identity: {
    type: String,
    required: true,
  },
  refreshToken: String,
  notes: Array,
  friendList: Array,
  username: String,
  projectList: Array,
});

const NOTE = mongoose.model("NOTES", noteSchema);
const USER = mongoose.model("USERS", userSchema);
const PROJECT = mongoose.model("PROJECT", projectSchema);

app.post("/notes/register", async (req, res) => {
  const email = req.body.user;
  const _identity = uniqueString();
  const _shortIdentity = _identity.slice(0, 5);
  const finallIdentity = "#" + _shortIdentity;

  try {
    const emails = await USER.findOne({ email: email });
    if (emails === null) {
      const user = await new USER({
        email: req.body.user,
        password: req.body.pword,
        identity: finallIdentity,
        username: req.body.user,
      }).save();
      res.status(200).send("User saved");
      console.log("User saved");
    } else {
      res.status(409).send("Error");
    }
  } catch (err) {
    res.send(err);
  }
});

app.get("/notes/",(req,res)=>{
  res.send("Its working on vercel");
})

/* app.get("/notes/test", (req,res)=>{
	const _identity = uniqueString();
  	const _shortIdentity = _identity.slice(0,5);
  	const finallIdentity = "#" + _shortIdentity;
	res.send(finallIdentity);
  
}); */

app.post("/notes/login", async (req, res) => {
  const email = req.body.email;
  const password = req.body.pwd;

  try {
    const user = await USER.findOne({ email: email, password: password });
    if (user !== null) {
      console.log("User find");
      const accessToken = jwt.sign(
        {
          email: email,
        },
        process.env.ACCES_TOKEN_SECRET,
        { expiresIn: "2m" }
      );

      const refreshToken = jwt.sign(
        {
          email: email,
        },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "3d" }
      );

      user.refreshToken = refreshToken;
      const result = await user.save();
      res.cookie("jwt", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.json({ accessToken });
    } else {
      res.status(400).send("Error");
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/notes/logout", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204);
  const refreshToken = cookies.jwt;
  const foundUser = await USER.findOne({ refreshToken }).exec();
  if (!foundUser) {
    res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
    return res.sendStatus(204);
  }

  // Delete refreshToken in db
  foundUser.refreshToken = "";
  const result = await foundUser.save();
  res.clearCookie("jwt", { httpOnly: true, sameSite: "None", secure: true });
  res.sendStatus(204);
});

app.get("/notes/refresh", async (req, res) => {
  const cookies = req.cookies;

  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;

  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
        if (err || user.email !== decoded.email) return res.sendStatus(403);
        const accessToken = jwt.sign(
          {
            email: user.email,
          },
          process.env.ACCES_TOKEN_SECRET,
          { expiresIn: "2m" }
        );
        res.json({ accessToken });
      }
    );
  } catch (err) {
    res.send(err);
  }
});

app.use(verifyJWT);

app.post("/notes/createnote", async (req, res) => {
  const cookies = req.cookies;
  const note = req.body;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    const _note = {
      id: note.id,
      title: note.title,
      content: note.note,
      priority: note.selectedPriority,
      tags: note.tagList,
      status: "todo",
    };

    user.notes.unshift(_note);
    user.save();
    res.status(200);
  } catch (err) {}
});

app.post("/notes/deletenote", async (req, res) => {
  const cookies = req.cookies;
  const _index = req.body.index;

  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    user.notes.splice(_index, 1);
    await user.save();
    res.status(200);
    res.send("Oke");
  } catch (err) {
    res.send(err);
  }
});

app.patch("/notes/movetoprogress", async (req, res) => {
  const cookies = req.cookies;
  const _index = req.body.index;
  const _id = req.body.id;
  console.log(_id);
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  try {
    const user = await USER.findOneAndUpdate(
      { refreshToken, "notes.id": _id },
      { $set: { "notes.$.status": "progress" } }
    );
    console.log("succes");
    res.status(200);
    res.send("Oke");
  } catch (err) {
    console.log(err);
    return res.sendStatus(403);
  }
});

app.get("/notes/getfriends", async (req, res) => {
  const cookies = req.cookies;
  console.log("yoooooooooooooooooooooooo");
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    res.send(user.friendList);
    res.status(200);
  } catch (err) {
    console.log(err);
  }
});

app.post("/notes/addfriend", async (req, res) => {
  console.log("ssss");
  const cookies = req.cookies;
  const _friendId = req.body.id;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  const userForAdd = await USER.findOne({ identity: _friendId }).exec();
  if (!userForAdd) return res.sendStatus(403);
  try {
    userForAdd.friendList.push({
      userId: user.identity,
      userName: user.username,
      accepted: false,
    });
    console.log("user Added");
    userForAdd.save();
  } catch (err) {
    console.log(err);
  }
});

app.post("/notes/acceptFriend", async (req, res) => {
  const cookies = req.cookies;
  const _friendId = req.body.senderId;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  try {
    const user = await USER.findOneAndUpdate(
      {
        refreshToken,
        "friendList.userId": _friendId,
      },
      { $set: { "friendList.$.accepted": true } }
    );

    await USER.findOneAndUpdate(
      {
        identity: _friendId,
      },
      {
        $push: { friendList: { userId: user.identity,userName: user.username, accepted: true } },
      }
    );

    res.status(200);
    res.send("Oke");
  } catch (err) {
    console.log(err);
  }
});

app.patch("/notes/movetocomplete", async (req, res) => {
  const cookies = req.cookies;
  const _id = req.body.id;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  try {
    const user = await USER.findOneAndUpdate(
      { refreshToken, "notes.id": _id },
      { $set: { "notes.$.status": "complete" } }
    );
    console.log(user);
    res.status(200);
    res.send("Oke");
  } catch (err) {
    console.log(err);
    return res.sendStatus(403);
  }
});

//DashBoard => UserTab => Functions
/* ---------------------------------------- Start ---------------------------------------- */
app.get("/",(req,res)=>{
  res.send("Yooo");
})



app.get("/notes/getuserinfo", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    let _todo = 0;
    let _progress = 0;
    let _complete = 0;
    [...user.notes].map((item) => {
      if (item.status === "todo") {
        _todo += 1;
      } else if (item.status === "progress") {
        _progress += 1;
      } else if (item.status === "complete") {
        _complete += 1;
      }
    });
    const identity = user.identity;
    const email = user.email;
    const notesStatus = {
      todo: _todo,
      progress: _progress,
      complete: _complete,
    };
    const username = user.username;

    res.send(JSON.stringify({ identity, username, email, notesStatus }));
    res.status(200);
  } catch (err) {
    console.log(err);
  }
});

app.patch("/notes/changename", async (req, res) => {
  const _newName = req.body.value;

  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  try {
    await USER.findOneAndUpdate({ refreshToken }, { username: _newName });
    res.status(200);
    res.send("oke");
  } catch (err) {
    console.log(err);
  }
});
/* ---------------------------------------- End ---------------------------------------- */
app.get("/notes", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    const notes = user.notes.reverse();
    res.send(notes);
  } catch (err) {
    console.log(err);
  }
});

app.post("/notes/findUser", async (req, res) => {
  const _user = req.body.user;
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
});

app.post("/notes/postproject", async (req, res) => {
  const cookies = req.cookies;
  const _project = req.body;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  try {
    const project = await new PROJECT({
      title: _project.title,
      desc: _project.description,
      tasks: [],
      team: [..._project.team, user.identity],
      todoStatus: 0,
      progressStatus: 0,
      completeStatus: 0,
    }).save();

    project.team.map(async (item, index) => {
      console.log(item);
      await USER.findOneAndUpdate(
        { identity: item },
        { $push: { projectList: project._id } }
      );
    });

    res.status(200).send();
  } catch (err) {
    console.log(err);
  }
});

app.get("/notes/fetchProjectsInfo", async (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const user = await USER.findOne({ refreshToken }).exec();
  if (!user) return res.sendStatus(403);
  const _projects = [];
  try {
    await Promise.all(
      user.projectList.map(async (item, index) => {
        await PROJECT.findOne({ _id: item })
          .exec()
          .then((data) => {
            _projects.push({
              _id: data._id,
              title: data.title,
              desc: data.desc,
              team: data.team,
              todo: data.todoStatus,
              progress: data.progressStatus,
              complete: data.completeStatus,
            });
          });
      })
    );
    res.send(_projects);
  } catch (err) {
    console.log(err);
    res.send(err);
  }
});

/* Project Tasks API CRUD OPERATION */
/* -------------------------------START------------------------------- */

app.post("/notes/fetchProjectsTasks", async (req, res) => {
  const cookies = req.cookies;
  const id = req.body.projectId;
  console.log(req.body);
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const project = await PROJECT.findOne({ _id: id }).exec();
  if (!project) return res.sendStatus(404);
  try {
    console.log("sssss");
    res.send(project);
  } catch (err) {
    console.log(err);
  }
});

app.post("/notes/saveProjectTask", async (req, res) => {
  const cookies = req.cookies;
  console.log("popopyyyyopopop");
  const { projectId, taskId, title, msg, priority, tags, status,creator } = req.body;

  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const project = await PROJECT.findOne({ _id: projectId }).exec();
  if (!project) return res.sendStatus(404);
  try {
    const _note = {
      id: taskId,
      title,
      msg,
      priority,
      tags,
      status,
    };
    console.log(_note);
    console.log(project);
    project.todoStatus += 1;
    project.tasks.unshift(_note);
    project.save();
    res.status(200).send();
    res
  } catch (err) {
    console.log(err);
  }
});

app.patch("/notes/moveProjectTask", async (req, res) => {
  const cookies = req.cookies;
  const { projectId, taskId, status } = req.body;
  console.log(taskId);

  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;

  try {
    const _project = await PROJECT.findOneAndUpdate(
      { _id: projectId, "tasks.id": taskId },
      { $set: { "tasks.$.status": status } }
    );

    console.log(_project);
    if (status === "progress") {
      _project.todoStatus -= 1;
      _project.progressStatus += 1;
    } else if (status === "complete") {
      _project.progressStatus -= 1;
      _project.completeStatus += 1;
    }
    _project.save();
    console.log(_project);

    res.status(200).send();
  } catch (err) {
    console.log(err);
  }
});

app.post("/notes/deleteProjectTask", async (req, res) => {
  const cookies = req.cookies;
  const { projectId, taskId, index, status } = req.body;
  console.log(req.body);
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const project = await PROJECT.findOne({ _id: projectId }).exec();
  if (!project) return res.sendStatus(404);
  try {
    if (status === "todo") {
      project.todoStatus -= 1;
    } else if (status === "progress") {
      project.progressStatus -= 1;
    } else if (status === "complete") {
      project.completeStatus -= 1;
    }
    project.tasks.splice(index, 1);
    await project.save();
    res.status(200);
    res.send("Oke");
  } catch (err) {
    console.log(err);
  }
});
/* -------------------------------END------------------------------- */

app.post("/notes/sendTask", async (req, res) => {
  const cookies = req.cookies;
  const { data } = req.body;
  if (!cookies?.jwt) return res.sendStatus(401);
  const refreshToken = cookies.jwt;
  const senderUser = await USER.findOne({ refreshToken }).exec();
  const reciverUser = await USER.findOne({ identity: data.reciver }).exec();
  if (!senderUser) return res.sendStatus(403);
  try {
    reciverUser.notes.unshift({ ...data, creator: senderUser.identity });
    reciverUser.save();
    res.status(200).send();
  } catch (err) {
    console.log(err);
    res.send(err);
  }
});

app.listen("4000", function () {
  console.log("connect succ.");
});

export default app
