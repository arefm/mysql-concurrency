'use strict'

import http from 'http'
import { waterfall, parallel } from 'async'
import Sequelize from 'sequelize'
import request from 'request'
import cls from 'continuation-local-storage'

const Session = cls.createNamespace('my-session')
Sequelize.useCLS(Session)

waterfall([
    (callback) => {
        const dbConn = new Sequelize('stats', 'root', 'password', {
            host: 'localhost',
            dialect: 'mysql',
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            },
            operatorAliases: false,
            logging: false
        })

        dbConn.authenticate()
            .then(() => {
                console.log('Connection has been established successfully.')
                callback(null, dbConn)
            })
            .catch(err => callback(err.message))
    },
    (dbConn, callback) => {
        const StatsModel = dbConn.define('Stats', {
            counter: {
                type: Sequelize.INTEGER
            }
        })
        StatsModel.sync({ force: true })
            .then(() => {
                StatsModel.create({
                        counter: 0
                    })
                    .then(() => {
                        console.log('Model Synced.')
                        callback(null, dbConn, StatsModel)
                    })
                    .catch((err) => callback(err))
                return null
            })
            .catch((err) => callback(err))
    }
], (err, dbConn, Model) => {
    if (err) {
        throw new Error(err)
        return
    }

    http.createServer((req, res) => {
        const httpReq = `${req.method} ${req.url}`
        switch (httpReq) {
            case 'GET /':
            	// problem happens here...
                Model.findOne({
                        where: { id: 1 },
                        attributes: ['id', 'counter', 'updatedAt']
                    })
                    .then(Item => {
                        let counter = Item.counter + 1
                        Model.update({
                                counter: counter
                            }, {
                                where: { id: Item.id }
                            })
                            .then(() => {
                                console.log(`updating counter from ${Item.counter} to ${counter}`)
                                res.end(String(counter))
                            })
                            .catch(err => {
                                throw new Error(err)
                            })
                    })
                    .catch(err => {
                        throw new Error(err)
                    })
                break
            case 'GET /solution':
            	// trying to use transaction...
                dbConn.transaction(trans1 => {
                    console.log('transaction session (trans1):', Session.get('transaction') === trans1)
                    return Model.findOne({
                            where: { id: 1 },
                            attributes: ['id', 'counter', 'updatedAt']
                        })
                        .then(Item => {
                        	dbConn.transaction(trans2 => {
                        		console.log('transaction session (trans2):', Session.get('transaction') === trans2)
	                            let counter = Item.counter + 1
	                            return Model.update({
	                                    counter: counter
	                                }, {
	                                    where: { id: Item.id },
	                                    transaction: trans2
	                                })
	                                .then(() => {
	                                    console.log(`updating counter from ${Item.counter} to ${counter}`)
	                                    res.end(String(counter))
	                                    // return trans2.commit()
	                                })
	                                .catch(err => {
	                                    throw new Error(err)
	                                    // return trans2.rollback()
	                                })
                        	})
                            return null
                        })
                        .catch(err => {
                            throw new Error(err)
                        })
                    return null
                })
                break
            case 'POST /':
            case 'POST /solution':
            	let Url = 'http://localhost:3000/'
            	if (req.url === '/solution')
            		Url += 'solution'
                parallel({
                    updCounter1: (callback) => {
                        request.get(Url, (err, resp, body) => {
                            if (err)
                                return callback(err)
                            callback(null, body)
                        })
                    },
                    updCounter2: (callback) => {
                        request.get(Url, (err, resp, body) => {
                            if (err)
                                return callback(err)
                            callback(null, body)
                        })
                    },
                    updCounter3: (callback) => {
                        request.get(Url, (err, resp, body) => {
                            if (err)
                                return callback(err)
                            callback(null, body)
                        })
                    }
                }, (err, done) => {
                    if (err) {
                        throw new Error(err)
                        return
                    }
                    res.end(JSON.stringify(done))
                })
                break
        }
    }).listen(3000)

    console.log('app is listening on port 3000')
})