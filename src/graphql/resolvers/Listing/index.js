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
exports.listingResolvers = void 0;
const mongodb_1 = require("mongodb");
const api_1 = require("../../../lib/api");
const types_1 = require("../../../lib/types");
const utils_1 = require("../../../lib/utils");
const types_2 = require("./types");
/**
 * @verifyHostListingInput
 * 检查并限制用户的输入
 */
const verifyHostListingInput = ({ title, description, type, price }) => {
    if (title.length > 100) {
        throw new Error("列表标题必须少于100个字符");
    }
    if (description.length > 5000) {
        throw new Error("列表说明必须少于5000个字符");
    }
    if (type !== types_1.ListingType.Apartment && type !== types_1.ListingType.House) {
        throw new Error("列表类型必须是公寓或房屋");
    }
    if (price < 0) {
        throw new Error("价格必须大于0");
    }
};
// 指定ID的返回解析函数
exports.listingResolvers = {
    Query: {
        listing: (_root, { id }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // mongo查找id
                const listing = yield db.listings.findOne({ _id: new mongodb_1.ObjectId(id) });
                if (!listing) {
                    throw new Error("listing can't be found");
                }
                // 请求数据库，判断查看者和请求者的id
                const viewer = yield utils_1.authorize(db, req);
                if (viewer && viewer._id === listing.host) {
                    listing.authorized = true;
                }
                return listing;
            }
            catch (error) {
                throw new Error(`Failed to query listing: ${error}`);
            }
        }),
        listings: (_root, { location, filter, limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const query = {};
                // 初始化ListingsData
                const data = {
                    region: null,
                    total: 0,
                    result: []
                };
                // geocode
                if (location) {
                    try {
                        const { country, admin, city } = yield api_1.Google.geocode(location);
                        // 筛选geocode返回值，对其做出不同设置
                        if (city)
                            query.city = city;
                        if (admin)
                            query.admin = admin;
                        if (country) {
                            query.country = country;
                        }
                        else {
                            throw new Error("no country found");
                        }
                        const cityText = city ? `${city}, ` : "";
                        const adminText = admin ? `${admin}, ` : "";
                        data.region = `${cityText}${adminText}${country}`;
                    }
                    catch (e) {
                        // TODO: i have use https instead of http , this is Error , server -> 403
                        console.log(`错误`, e);
                    }
                }
                // 定义游标 分段数据库信息
                let cursor = yield db.listings.find(query);
                // 升序
                if (filter && filter === types_2.ListingsFilter.PRICE_LOW_TO_HIGH) {
                    cursor = cursor.sort({ price: 1 });
                }
                // 降序
                if (filter && filter === types_2.ListingsFilter.PRICE_HIGH_TO_LOW) {
                    cursor = cursor.sort({ price: -1 });
                }
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
                throw new Error(`请求到用户的列表失败： ${error}`);
            }
        })
    },
    Mutation: {
        hostListing: (_root, { input }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            //  1. 对前端传递过来的form数据进行校验
            verifyHostListingInput(input);
            let viewer = yield utils_1.authorize(db, req);
            // 如果用户不存在直接抛出异常
            if (!viewer) {
                throw new Error("viewer cannot be found");
            }
            // const { country, admin, city } = await Google.geocode(input.address);
            // if (!country || !admin || !city) {
            //   throw new Error("invalid address input");
            // }
            //  3. 向数据库存储内容
            console.log(`开始向数据库写入房子信息`);
            const imageUrl = yield api_1.Cloudinary.upload(input.image);
            const insertResult = yield db.listings.insertOne(Object.assign(Object.assign({ _id: new mongodb_1.ObjectId() }, input), { image: imageUrl, bookings: [], bookingsIndex: {}, country: 'mock', admin: 'mock', city: 'mock', host: viewer._id }));
            // 4. 向数据库中对应的用户信息中插入房子内容
            const insertedListing = insertResult.ops[0];
            yield db.users.updateOne({ _id: viewer._id }, { $push: { listings: insertedListing._id } });
            // 5. 将处理完毕的房子信息返回
            return insertedListing;
        })
    },
    Listing: {
        id: (listing) => {
            return listing._id.toString();
        },
        host: (listing, _args, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            // 查询mongo
            const host = yield db.users.findOne({ _id: listing.host });
            if (!host) {
                throw new Error("不能找到host");
            }
            return host;
        }),
        // json中，将bookingIndex对象转换成字符串
        bookingsIndex: (listing) => {
            return JSON.stringify(listing.bookingsIndex);
        },
        bookings: (listing, { limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // 未经授权的用户
                if (!listing.authorized) {
                    return null;
                }
                // 初始化UserBookingsData
                const data = {
                    total: 0,
                    result: []
                };
                // 定义游标 分段数据库信息
                let cursor = yield db.bookings.find({
                    _id: { $in: listing.bookings }
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
                throw new Error(`查询请求预订列表错误 ${error}`);
            }
        }),
    }
};
