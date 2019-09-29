import { Intent } from "@blueprintjs/core";
import { EVENTS } from "@common/constants/events";
import { rootReducer, StoreState } from "@common/store";
import { logout } from "@common/store/auth";
import { PlayerActionTypes } from "@common/store/player";
import { addToast, UIActionTypes } from "@common/store/ui";
import { connectRouter, routerMiddleware } from "connected-react-router";
import { ipcRenderer } from "electron";
import { createHashHistory } from "history";
import { applyMiddleware, compose, createStore, Middleware, Store } from "redux";
import { electronEnhancer } from "redux-electron-store";
import { createLogger } from "redux-logger";
import promiseMiddleware from "redux-promise-middleware";
import thunk from "redux-thunk";
import { REDUX_STATES } from "../types";

const history = createHashHistory();

const router = routerMiddleware(history);

const test: Middleware = (store: Store<StoreState>) => (next) => (action) => {

    if (action.type && action.type.endsWith("_ERROR")) {
        const { payload: { message, response } } = action;

        if (message && message === "Failed to fetch") {
            // const { app: { offline } } = store.getState()


        } else if (response && response.status === 401) {
            const { config: { auth: { expiresAt, refreshToken } } } = store.getState();

            if(!refreshToken){
                store.dispatch<any>(logout());
            } else {
                if(expiresAt && expiresAt < Date.now()){
                    ipcRenderer.send(EVENTS.APP.AUTH.REFRESH);
                }
            }
        } else if (message) {
            store.dispatch(addToast({
                message: "Something went wrong",
                intent: Intent.DANGER
            }));
        }
    }
    try {
        return next(action);
    } catch (err) {
        throw err;
    }
};

const logger = createLogger({
    level: "info",
    collapsed: true,
    predicate: (_getState: () => any, action: any) => action.type !== UIActionTypes.SET_SCROLL_TOP && action.type !== PlayerActionTypes.SET_TIME
} as any);

const middleware = [
    test,
    thunk,
    router,
    promiseMiddleware({
        promiseTypeSuffixes: Object.keys(REDUX_STATES)
    })
];

if (process.env.NODE_ENV === "development") {
    middleware.push(logger);
}

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ?
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ :
    compose;

const enhancer = composeEnhancers(applyMiddleware(...middleware), electronEnhancer({
    filter: {
        app: true,
        config: true,
        player: {
            status: true,
            currentPlaylistId: true,
            playingTrack: true
        },
        modal: true,
        auth: {
            authentication: true
        },
        ui: {
            toasts: true
        }
    }
}));

const configureStore = (): Store<StoreState> => {
    const store: Store<StoreState> = createStore(connectRouter(history)(rootReducer), enhancer);

    if (module.hot) {
        module.hot.accept("@common/store", () => {
            ipcRenderer.sendSync("renderer-reload");

            const { rootReducer } = require("@common/store");

            store.replaceReducer(connectRouter(history)(rootReducer) as any);
        });
    }

    return store;
};

export { configureStore, history };

