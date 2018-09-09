import { Router } from "express";
import * as cells from "./cells";
import * as home from "./home";
import * as maps from "./maps";
import * as quizzes from "./quizzes";
import * as sharedText from "./sharedText";
import * as snake from "./snake";
import * as tictactoe from "./tictactoe";
import * as todolist from "./todolist";

export interface IRoutes {
    cells: Router;
    home: Router;
    maps: Router;
    quizzes: Router;
    sharedText: Router;
    snake: Router;
    tictactoe: Router;
    todolist: Router;
}

export function create(config: any): IRoutes {

    return {
        cells: cells.create(config),
        home: home.create(config),
        maps: maps.create(config),
        quizzes: quizzes.create(config),
        sharedText: sharedText.create(config),
        snake: snake.create(config),
        tictactoe: tictactoe.create(config),
        todolist: todolist.create(config),
    };
}
