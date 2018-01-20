'use strict';

const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
const requestNode = require('request'); // Web request library
const dateFormat = require('dateformat'); // Date library
const compareDates = require('compare-dates'); // Another date library

function getNaturalDate(aStartDate) {
    return new Promise((resolve, reject) => {
        let startDate = new Date(aStartDate);
        startDate = compareDates.subtract(startDate, 5, 'hour');
        if (compareDates.isSame(new Date(), startDate, 'day')) {
            resolve("today at " + dateFormat(startDate, "h TT") +  " Eastern Standard Time.");
        } else {
            resolve("this " + dateFormat(startDate, "dddd") + " at " + dateFormat(startDate, "h TT") + " Eastern Standard Time.");
        }
        resolve(" but for some reason I am not sure when.")
    })
}

function getMatchStatus(team1, team2, scores) {
    return new Promise((resolve, reject) => {
        let team1score = scores[0].value;
        let team2score = scores[1].value;
        if (team1score == team2score) {
            resolve(", and the score is tied " + team1score + " to " + team2score);
        } else if (team2score < team1score) {
            resolve(", and " + team1.name + " has the lead, " + team1score + " to " + team2score)
        } else if (team1score < team2score) {
            resolve(", and " + team2.name + " has the lead, " + team2score + " to " + team1score)
        } else {
            resolve("you should run and hide because math dead")
        }
    })
}

function getCurrentGame(games) {
    return new Promise((resolve, reject) => {
        let currentGame;
        for (let i = 0; i < games.length; i++) {
            if (games[i] == "IN_PROGRESS") {
                currentGame = games[i];
            }
        }
        if (currentMap) {
            resolve(currentGame);
        } else {
            reject();
        }
    })
}

function getGameStatus(team1, team2, game) {

    return new Promise((resolve, reject) => {
        let winningTeam;
        if(game.attributes.mapScore.team1 < game.attributes.mapScore.team2) {
            winningTeam = team2 + " has the lead, ";
        }
        else if (game.attributes.mapScore.team2 < game.attributes.mapScore.team1){
            winningTeam = team1 + " has the lead, "
        }
        else {
            winningTeam = " It is tied,"
        }
        resolve("Currently they are playing on " + game.attributes.junkertown + ". " + + " with the in game score being " +
            game.mapScore.team1 + " to " + game.mapScore.team2);
    })
}


function getCompletedGames(games) {
    return new Promise((resolve, reject) => {
        let completedGames;
        for (let i = 0; i <= games.length; i++) {
            if (games[i].state == "CONCLUDED" || games[i] == "PENDING") {
                completedGames++;
            }
        }
        console.log("Comp games" + completedGames)
        resolve(completedGames);
    })
}

function getCurrentMatch(team1, team2, game) {
    return new Promise((resolve, reject) => {
        resolve(team1.name + " is playing against " +
            team2.name + " right now. ");
    });
}

function getFutureMatch(team1, team2, startDate) {
    return new Promise((resolve, reject) => {
        resolve(team1.name + " will be playing against " + team2.name);
    })
}

function contactOwlApi(requestUrl) {
    return new Promise((resolve, reject) => {
        var options = {
            method: 'GET',
            url: requestUrl,
            headers: {
                'User-Agent': 'github.com/evanextreme/watchpoint',
                'From': 'exh7928@rit.edu'
            }
        };
        requestNode(options, function(error, response, body) {
            if (error) throw new Error(error);
            let resp = JSON.parse(body);
            if (resp.error == 404) {
                console.log(resp.error)
                reject();
            } else {
                resolve(resp);
            }
        });
    });
}

function requestLiveMatch() {
    return contactOwlApi('https://api.overwatchleague.com/live-match/?locale=en-us');
}

function requestSchedule() {
    return contactOwlApi('https://api.overwatchleague.com/schedule/?locale=en-us')
}

function requestStandings() {
    return contactOwlApi('https://api.overwatchleague.com/standings/?locale=en-us')
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {



    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    if (request.body.result) {
        processV1Request(request, response);
    } else if (request.body.queryResult) {
        processV2Request(request, response);
    } else {
        console.log('Invalid Request');
        return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
    }
});
/*
 * Function to handle v1 webhook requests from Dialogflow
 */
function processV1Request(request, response) {
    let action = request.body.result.action; // https://dialogflow.com/docs/actions-and-parameters
    let parameters = request.body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
    let inputContexts = request.body.result.contexts; // https://dialogflow.com/docs/contexts
    let requestSource = (request.body.originalRequest) ? request.body.originalRequest.source : undefined;


    const requestPermission = (app) => {
      app.askForPermission('To locate you', app.SupportedPermissions.DEVICE_PRECISE_LOCATION);
    };

    const userInfo = (app) => {
        if (app.isPermissionGranted()) {
            const address = app.getDeviceLocation().address;
            app.tell(`You are at ${address}`);
        } else {
            app.tell('Sorry, I could not figure out where you are.');
        }
    };

    const actions = new Map();


    const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
    const app = new DialogflowApp({
        request: request,
        response: response
    });

    actions.set('request_permission', requestPermission);
    actions.set('user_info', userInfo);


    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {
        // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
        'welcome': () => {
            requestLiveMatch()
                .then((resp) => {
                    let liveMatch = resp.data.liveMatch;
                    let status = liveMatch.liveStatus;
                    let team1 = liveMatch.competitors[0];
                    let team2 = liveMatch.competitors[1];
                    if (status == "UPCOMING") {
                        let startDate = liveMatch.startDateTS;
                        return getFutureMatch(team1, team2, startDate)
                            .then((futureMatch) => {
                                return ("Welcome to Watchpoint, your portal to the Overwatch League! The next scheduled match is " +
                                    futureMatch + " " + naturalDate + '. To get more info on a match, say "tell me about the current match"');
                            });
                    } else {
                        let games = liveMatch.games;
                        return getCurrentMatch(team1, team2, games)
                            .then((currentMatch) => {
                                return ("Welcome to Watchpoint, your portal to the Overwatch League! Looks like the league is live right now! " +
                                    futureMatch + ". You can watch it live on Twitch, and OverwatchLeague.com. Try asking me questions like... What is the match score? What map are they on? and more. ");
                            });
                    }
                })
                .then((textResp) => {
                    console.log("textResp " + textResp)
                    let responseToUser = {
                        //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
                        //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
                        speech: textResp, // spoken response
                        text: textResp // displayed response
                    };
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse(responseToUser); // Send simple response to user
                    } else {
                        sendResponse(responseToUser); // Send simple response to user
                    }
                })
                .catch(function(error) {
                    console.log(error)
                    sendResponse("Sorry, but i'm having trouble talking to the Overwatch League right now. Try again another time.")
                })
        },
        'getCurrentMatch': () => {
            // Ask for one permission
            requestLiveMatch()
                // TODO refactor promise chain
                .then((resp) => {
                    let liveMatch = resp.data.liveMatch;
                    let matchId = liveMatch.id;
                    let team1 = liveMatch.competitors[0];
                    let team2 = liveMatch.competitors[1];
                    let scores = liveMatch.scores;
                    let status = liveMatch.liveStatus;
                    let startDate = liveMatch.startDateTS;
                    let games = liveMatch.games;


                    if (status == "UPCOMING") {
                        //TODO fix promises when UPCOMING
                        return getNaturalDate(startDate)
                            .then((naturalDate) => {
                                return getFutureMatch(team1, team2, startDate)
                                    .then((futureMatch) => {
                                        return [liveMatch, ("No one is playing right now. " + futureMatch + " " + naturalDate)]
                                    });
                            })
                    } else {
                        return getCurrentMatch(team1, team2, scores)
                            .then((currentMatch) => {
                                return getCompletedGames(games)
                                    .then((completedGames) => {
                                        if (completedGames == 0) {
                                            return ["", (currentMatch + " The first game is about to start. ")]
                                        } else {
                                            return ["YES", (currentMatch + " It is game " + completedGames + ", ")]
                                        }
                                    })
                                    .then((data) => {
                                        console.log("d0 " + data[0])
                                        let completedGames = data[1];
                                        if (data[0] == "YES") {
                                            return getMatchStatus(team1, team2, scores)
                                                .then((matchStatus) => {
                                                    return [liveMatch, (completedGames + matchStatus)]
                                                })
                                        } else {
                                            return [liveMatch, (completedGames)];
                                        }
                                    })
                            })
                    }
                })
                // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
                .then((data) => {
                    let liveMatch = data[0];
                    let textResp = data[1];
                    console.log("liveMatch" + liveMatch)
                    let responseToUser = {
                        speech: textResp, // spoken response
                        text: textResp, // displayed response
                    };
                    console.log("responseToUser " + responseToUser)

                    if (requestSource === googleAssistantRequest) {
                        app.tell(textResp);
                        // sendGoogleResponse(responseToUser); // Send simple response to user
                    } else {
                        sendResponse(responseToUser); // Send simple response to user
                    }
                })
                .catch(function(error) {
                    console.log(error)
                    app.tell("Sorry, but i'm having trouble talking to the Overwatch League right now, and couldn't find the match you wanted. Try again another time.")
                    throw error
                })
        },
        'getCurrentGame': () => {
            app.askForPermission('To locate you', app.SupportedPermissions.DEVICE_PRECISE_LOCATION);

            requestLiveMatch()
                .then((resp) => {
                    let liveMatch = resp.data.liveMatch;
                    let matchId = liveMatch.id;
                    let team1 = liveMatch.competitors[0];
                    let team2 = liveMatch.competitors[1];
                    let scores = liveMatch.scores;
                    let status = liveMatch.liveStatus;
                    let startDate = liveMatch.startDateTS;
                    let games = liveMatch.games;

                    if (status == "UPCOMING") {
                        //TODO fix promises when UPCOMING
                        return ("Nothing is being played right now. Try asking me again when the league is live.")
                    }
                    return getCurrentGame(games)
                        .then((currentGame) => {
                            return getGameStatus(team1, team2, currentGame);
                        });
                })
                .then((textResp) => {
                    let responseToUser = {
                        //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
                        //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
                        speech: textResp, // spoken response
                        text: textResp // displayed response
                    };
                    console.log("responseToUser = " + responseToUser)
                    if (requestSource === googleAssistantRequest) {
                        app.tell(textResp);
                        // sendGoogleResponse(responseToUser); // Send simple response to user
                    } else {
                        sendResponse(responseToUser); // Send simple response to user
                    }
                })
                .catch(function(error) {
                    console.log(error)
                    app.tell("Sorry, but i'm having trouble talking to the Overwatch League right now, and couldn't find the game you wanted. Try again another time.")
                    throw error
                })
        },
        'getStandings': () => {
            let division = (parameters.division === "Atlantic") ? 79 : 80;
            requestStandings(division)
            .then((resp) => {
                // Atlantic = 79, Pacific = 80
                // Parsing a JSON with a number as a key is tricky. Brackets seem to be the best solution
                var dataArr = (division === 79) ? resp.season.division['79'] : resp.season.division['80'];
                
                for(var i = 0; i < dataArr.length; i++) {
                    if(parameters.teamname === dataArr[i].name) {
                        var resp = "The " + parameters.teamname + " have " + dataArr[i].standings.wins + " wins and " + dataArr[i].standings.losses + " losses for a total of " + dataArr[i].standings.points + " points.";
                        if (requestSource === googleAssistantRequest) {
                            sendGoogleResponse(resp);
                        } else {
                            sendResponse(resp);
                        }
                        break;
                    }
                }
            })
        },
        'input.search': () => {
            console.log("params " + parameters.user);
            let username = parameters.user.split(' ').join('-');
            let promise = new Promise((resolve, reject) => {
                    var options = {
                        method: 'GET',
                        url: "https://www.owapi.net/api/v3/u/" + username + "/stats",
                        headers: {
                            'User-Agent': 'github.com/evanextreme/watchpoint',
                            'From': 'exh7928@rit.edu'
                        }
                    };
                    requestNode(options, function(error, response, body) {
                        if (error) throw new Error(error);
                        console.log(body);
                        let info = JSON.parse(body);
                        if (info.error == 404) {
                            reject(new Error("T"));
                        } else {
                            console.log("rank is " + info.us.stats.competitive.overall_stats.comprank);
                            let compRank = info.us.stats.competitive.overall_stats.comprank;
                            resolve(compRank);
                        }

                    });
                })
                .then((rank) => {
                    // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
                    if (requestSource === googleAssistantRequest) {
                        sendGoogleResponse('Your competitive rank is ' + rank); // Send simple response to user
                    } else {
                        sendResponse('Your competitive rank is ' + rank); // Send simple response to user
                    }
                })
        },
        // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
        'input.unknown': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                sendGoogleResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
            } else {
                sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
            }
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            if (requestSource === googleAssistantRequest) {
                let responseToUser = {
                    //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
                    //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
                    speech: 'This message is from Dialogflow\'s Cloud Functions for Firebase editor 3!', // spoken response
                    text: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
                };
                sendGoogleResponse(responseToUser);
            } else {
                let responseToUser = {
                    //data: richResponsesV1, // Optional, uncomment to enable
                    //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
                    speech: ('This message is from Dialogflow\'s Cloud Functions for Firebase editor 4!'), // spoken response
                    text: ('This is from Dialogflow\'s Cloud Functions for Firebase editor! :-) ') // displayed response
                };
                sendResponse(responseToUser);
            }
        }
    };
    // If undefined or unknown action use the default handler
    if (!actionHandlers[action]) {
        action = 'default';
    }
    // Run the proper handler function to handle the request from Dialogflow
    actionHandlers[action]();
    // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
    function sendGoogleResponse(responseToUser) {
        if (typeof responseToUser === 'string') {
            app.ask(responseToUser); // Google Assistant response
        } else {
            // If speech or displayText is defined use it to respond
            let googleResponse = app.buildRichResponse().addSimpleResponse({
                speech: responseToUser.speech || responseToUser.displayText,
                displayText: responseToUser.displayText || responseToUser.speech
            });
            // Optional: Overwrite previous response with rich response
            if (responseToUser.googleRichResponse) {
                googleResponse = responseToUser.googleRichResponse;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.googleOutputContexts) {
                app.setContext(...responseToUser.googleOutputContexts);
            }
            console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
            app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
        }
    }
    // Function to send correctly formatted responses to Dialogflow which are then sent to the user
    function sendResponse(responseToUser) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = {};
            responseJson.speech = responseToUser; // spoken response
            responseJson.displayText = responseToUser; // displayed response
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
            responseJson.speech = responseToUser.speech || responseToUser.displayText;
            responseJson.displayText = responseToUser.displayText || responseToUser.speech;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            responseJson.data = responseToUser.data;
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            responseJson.contextOut = responseToUser.outputContexts;
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson); // Send response to Dialogflow
        }
    }
}
// Construct rich response for Google Assistant (v1 requests only)
const app = new DialogflowApp();
const googleRichResponse = app.buildRichResponse()
    .addSimpleResponse('This is the first simple response for Google Assistant')
    .addSuggestions(
        ['Suggestion Chip', 'Another Suggestion Chip'])
    // Create a basic card and add it to the rich response
    .addBasicCard(app.buildBasicCard(`This is a basic card.  Text in a
 basic card can include "quotes" and most other unicode characters
 including emoji 📱.  Basic cards also support some markdown
 formatting like *emphasis* or _italics_, **strong** or __bold__,
 and ***bold itallic*** or ___strong emphasis___ as well as other things
 like line  \nbreaks`) // Note the two spaces before '\n' required for a
        // line break to be rendered in the card
        .setSubtitle('This is a subtitle')
        .setTitle('Title: this is a title')
        .addButton('This is a button', 'https://assistant.google.com/')
        .setImage('https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
            'Image alternate text'))
    .addSimpleResponse({
        speech: 'This is another simple response',
        displayText: 'This is the another simple response 💁'
    });
// Rich responses for Slack and Facebook for v1 webhook requests
const richResponsesV1 = {
    'slack': {
        'text': 'This is a text response for Slack.',
        'attachments': [{
            'title': 'Title: this is a title',
            'title_link': 'https://assistant.google.com/',
            'text': 'This is an attachment.  Text in attachments can include \'quotes\' and most other unicode characters including emoji 📱.  Attachments also upport line\nbreaks.',
            'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
            'fallback': 'This is a fallback.'
        }]
    },
    'facebook': {
        'attachment': {
            'type': 'template',
            'payload': {
                'template_type': 'generic',
                'elements': [{
                    'title': 'Title: this is a title',
                    'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
                    'subtitle': 'This is a subtitle',
                    'default_action': {
                        'type': 'web_url',
                        'url': 'https://assistant.google.com/'
                    },
                    'buttons': [{
                        'type': 'web_url',
                        'url': 'https://assistant.google.com/',
                        'title': 'This is a button'
                    }]
                }]
            }
        }
    }
};
/*
 * Function to handle v2 webhook requests from Dialogflow
 */
function processV2Request(request, response) {
    // An action is a string used to identify what needs to be done in fulfillment
    let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
    // Parameters are any entites that Dialogflow has extracted from the request.
    let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
    // Contexts are objects used to track and store conversation state
    let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
    // Get the request source (Google Assistant, Slack, API, etc)
    let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
    // Get the session ID to differentiate calls from different users
    let session = (request.body.session) ? request.body.session : undefined;
    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {
        // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
        'input.welcome': () => {
            sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
        },
        // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
        'input.unknown': () => {
            // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
            sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
        },
        // Default handler for unknown or undefined actions
        'default': () => {
            let responseToUser = {
                //fulfillmentMessages: richResponsesV2, // Optional, uncomment to enable
                //outputContexts: [{ 'name': `${session}/contexts/weather`, 'lifespanCount': 2, 'parameters': {'city': 'Rome'} }], // Optional, uncomment to enable
                fulfillmentText: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
            };
            sendResponse(responseToUser);
        }
    };
    // If undefined or unknown action use the default handler
    if (!actionHandlers[action]) {
        action = 'default';
    }
    // Run the proper handler function to handle the request from Dialogflow
    actionHandlers[action]();
    // Function to send correctly formatted responses to Dialogflow which are then sent to the user
    function sendResponse(responseToUser) {
        // if the response is a string send it as a response to the user
        if (typeof responseToUser === 'string') {
            let responseJson = {
                fulfillmentText: responseToUser
            }; // displayed response
            response.json(responseJson); // Send response to Dialogflow
        } else {
            // If the response to the user includes rich responses or contexts send them to Dialogflow
            let responseJson = {};
            // Define the text response
            responseJson.fulfillmentText = responseToUser.fulfillmentText;
            // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
            if (responseToUser.fulfillmentMessages) {
                responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
            }
            // Optional: add contexts (https://dialogflow.com/docs/contexts)
            if (responseToUser.outputContexts) {
                responseJson.outputContexts = responseToUser.outputContexts;
            }
            // Send the response to Dialogflow
            console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
            response.json(responseJson);
        }
    }
}
const richResponseV2Card = {
    'title': 'Title: this is a title',
    'subtitle': 'This is an subtitle.  Text can include unicode characters including emoji 📱.',
    'imageUri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
    'buttons': [{
        'text': 'This is a button',
        'postback': 'https://assistant.google.com/'
    }]
};
const richResponsesV2 = [{
        'platform': 'ACTIONS_ON_GOOGLE',
        'simple_responses': {
            'simple_responses': [{
                'text_to_speech': 'Spoken simple response',
                'display_text': 'Displayed simple response'
            }]
        }
    },
    {
        'platform': 'ACTIONS_ON_GOOGLE',
        'basic_card': {
            'title': 'Title: this is a title',
            'subtitle': 'This is an subtitle.',
            'formatted_text': 'Body text can include unicode characters including emoji 📱.',
            'image': {
                'image_uri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png'
            },
            'buttons': [{
                'title': 'This is a button',
                'open_uri_action': {
                    'uri': 'https://assistant.google.com/'
                }
            }]
        }
    },
    {
        'platform': 'FACEBOOK',
        'card': richResponseV2Card
    },
    {
        'platform': 'SLACK',
        'card': richResponseV2Card
    }
];
