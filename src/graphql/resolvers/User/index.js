"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userResolvers = void 0;
const utils_1 = require("../../../lib/utils");
exports.userResolvers = {
    Query: {
        user: (_root, { id }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const user = yield db.users.findOne({ _id: id });
                // 未查找到用户
                if (!user) {
                    throw new Error("未查询到此用户");
                }
                const viewer = yield utils_1.authorize(db, req);
                // 匹配查看者和user_id是否相同
                if (viewer && viewer._id === user._id) {
                    user.authorized = true;
                }
                return user;
            }
            catch (error) {
                // 请求用户错误
                throw new Error(`没有请求到该用户: ${error}`);
            }
        })
    },
    User: {
        id: (user) => {
            return user._id;
        },
        hasWallet: (user) => {
            return Boolean(user.walletId);
        },
        income: (user) => {
            return user.authorized ? user.income : null;
        },
        bookings: (user, { limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // 未经授权的用户
                if (!user.authorized) {
                    return null;
                }
                // 初始化UserBookingsData
                const data = {
                    total: 0,
                    result: []
                };
                // 定义游标 分段数据库信息
                let cursor = yield db.bookings.find({
                    _id: { $in: user.bookings }
                });
                // 游标跳过
                cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
                // page =1 ；limit = 10 ; cursor starts at 0
                // page = 2; limit = 10 ; cursor start at 10
                // page =3 ; limit = 10 ; cursr start at 20
                cursor = cursor.limit(limit);
                data.total = yield cursor.count();
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`不能请求到用户的预订： ${error}`);
            }
        }),
        listings: (user, { limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // 初始化UserBookingsData
                const data = {
                    total: 0,
                    result: []
                };
                // 定义游标 分段数据库信息
                let cursor = yield db.listings.find({
                    _id: { $in: user.listings }
                });
                // 游标跳过
                cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
                // page =1 ；limit = 10 ; cursor starts at 0
                // page = 2; limit = 10 ; cursor start at 10
                // page =3 ; limit = 10 ; cursr start at 20
                cursor = cursor.limit(limit);
                data.total = yield cursor.count();
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`不能请求到用户的列表： ${error}`);
            }
        }),
    }
};
