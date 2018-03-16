import * as dynamoDbLib from "../../../libs/dynamodb-lib";
import { success, failure } from "../../../libs/response-lib";
import * as similarity  from "../../../libs/similarity-lib";
import AWS from "aws-sdk";
import _ from "underscore";
AWS.config.update({ region: "us-east-1" });
var p_result; var l_result;

export async function getpropertyById(event, context, callback) {
    const params = {
        TableName: 'rv_property',
        KeyConditionExpression: "P_ID = :p_id",
        ExpressionAttributeValues: {
            ":p_id": event.pathParameters.p_id
        }
    };
    try {
        console.log("p_result");
        // first step get property by ID from daynmo 
        p_result = await dynamoDbLib.call("query", params);

        console.log(p_result.Count);
        if (p_result.Count < 1) {
            callback(null, success("Not Found"));
            return;
        }
        await getPropertyReview(event.pathParameters.p_id);

        await getlandlord(event.pathParameters.p_id);
        //took the P_address from landlord object , all the object should have the same value 
        var p_address;
        if (p_result.Items[0].P_Address_Line1 == undefined)
            p_address = p_result.Items[0].P_Landlords[0].L_Address_Line1 + ' '+ p_result.Items[0].P_Landlords[0].L_Address_Line2;
        else
            p_address = p_result.Items[0].P_Address_Line1

        await getcomplaints(p_address);

        callback(null, success(p_result));
    } catch (e) {
        callback(null, failure(e));
    }
}

async function getPropertyReview(p_id) {
    console.log("getPropertyReview begin !!!!")
    var propertyparams = {
        TableName: 'Property_Reviews',
        FilterExpression: "P_ID = :p_id",
        ExpressionAttributeValues: {
            ":p_id": p_id
        }
    };
    let v_date, last_r_price = 0, v_renatl_respone = [];
    try {
        var Review = await dynamoDbLib.call("scan", propertyparams);
        console.log("Review data ", Review);
        var p_approval = 0; var p_rating = 0; var v_approval;
        if (Review.Count > 0) {
            console.log("We have reviews for this property good news :D ");
            var reviewList = [];
            for (let item of Review.Items) {


                if (item.PR_T_ID != null) {
                    var TenantParams = {
                        TableName: 'Tenant',
                        FilterExpression: "T_ID = :t_id",
                        ExpressionAttributeValues: {
                            ":t_id": item.PR_T_ID
                        }
                    };
                    var Tenant = await dynamoDbLib.call("scan", TenantParams);
                    console.log("Tenent Data ", Tenant);
                }
                var p_rental = await getRental(item.PR_ID);
                console.log("p_rental retttt", p_rental[0]);


                // compute last_rental_price GET all renatl and get which R_End_Date are the newest one to R_PRICE
                //if we have reviews but we dont have rental data               
                if (p_rental[0] != undefined) {
                    console.log("rent data", p_rental[0].R_End_Date)
                    if (v_date == undefined || v_date < new Date(p_rental[0].R_End_Date)) {
                        console.log("current End Date value - vdate- ", v_date)
                        v_date = new Date(p_rental[0].R_End_Date);
                        last_r_price = p_rental[0].R_Price;
                        console.log("current last_r_price value", last_r_price)
                    }
                }

                var reviewResponse = {
                    "T_City": Tenant.Count > 0 ? Tenant.Items[0].T_City : ' ',
                    "T_State": Tenant.Count > 0 ? Tenant.Items[0].T_State : ' ',
                    "PR_Types": item.PR_Types,
                    "PR_Title": item.PR_Title,
                    "PR_Created_Date": item.PR_Created_Date,
                    "PR_Condition": item.PR_Condition,
                    "PR_Approval": item.PR_Approval,
                    "PR_Rating": item.PR_Rating,
                    "PR_Rental": p_rental[0] != undefined ? { "R_ID": p_rental[0].R_ID } : {}
                }

                //compute step
                v_approval = item.PR_Approval == 'yes' ? 1 : 0;
                //Sum of value
                p_rating = p_rating + item.PR_Rating;
                p_approval = p_approval + v_approval;
                // console.log(item);
                reviewList.push(reviewResponse)
                //  console.log("reviewResponse",reviewResponse);
            }
            p_result.Items[0].P_Reviews = reviewList;
            p_result.Items[0].P_last_Rental_Price = last_r_price;
            p_result.Items[0].P_End_Date = v_date;
            p_result.Items[0].P_Approval_Rate = isNaN(p_approval / Review.Count) ? 0 : p_approval / Review.Count;
            p_result.Items[0].P_Avg_Rating = isNaN(p_rating / Review.Count) ? 0 : p_rating / Review.Count;
        }
        console.log("getPropertyReview ended successfully !!!!")
    }
    catch (err) {
        return err;
    }

}

async function getlandlord(p_id) {
    console.log("getlandlord begin!!!! ");
    console.log(p_id);
    var csd = new AWS.CloudSearchDomain({
        endpoint: 'search-landlords-fya3y4pbqgba23u6zmv6fnc43i.us-east-1.cloudsearch.amazonaws.com',
        apiVersion: '2013-01-01'
    });
    var params = {
        query: p_id,
        queryOptions: "{'fields':['l_properties']}"
    };
    var listOfObject = [];
    var P_Landlords = [];
    try {
        var data = await csd.search(params).promise();
        console.log(data);
        var i = 0;

        while (i < data.hits.hit.length) {
            var obj = JSON.parse(JSON.stringify(data.hits.hit[i].fields).replace(/[\[\]']+/g, ''));
            listOfObject.push(obj);
            i++;
        }
        console.log(listOfObject);

        //to get unique value
        var uniques = _.map(_.groupBy(listOfObject, function (doc) {
            return doc.L_ID;
        }), function (grouped) {
            return grouped[0];
        });

        console.log("GetLandlord  ended successfully !!!");

        for (let v_landlord of uniques) {
            var p_land;
            const l_params = {
                TableName: 'Landlord',
                KeyConditionExpression: "L_ID = :l_id",
                ExpressionAttributeValues: {
                    ":l_id": v_landlord.l_id
                }
            };
            console.log(v_landlord.l_id);
            //get landlord data
            l_result = await dynamoDbLib.call("query", l_params);
            console.log("First Step ", l_result);


            console.log("second Step get Landlord Review");
            var landlordReviews = await getlandlordReviews(v_landlord.l_id);

            p_land = l_result.Items[0];
            p_land.Landlord_Reviews = landlordReviews != undefined ? landlordReviews.Landlord_Reviews : [];
            p_land.L_Response_Rate = landlordReviews != undefined ? landlordReviews.L_Response_Rate : 0;
            p_land.L_Avg_Rating = landlordReviews != undefined ? landlordReviews.L_Avg_Rating : 0;
            p_land.L_Approval_Rate = landlordReviews != undefined ? landlordReviews.L_Approval_Rate : 0;
            p_land.LR_Repair_Requests = landlordReviews != undefined ? landlordReviews.LR_Repair_Requests : 0;

            P_Landlords.push(p_land);

        }
        p_result.Items[0].P_Landlords = P_Landlords;
        console.log("getlandlord ended successfully!!!! ");

    }
    catch (err) {
        console.log(err, err.stack); // an error occurred
        return err;
    }
}
async function getlandlordReviews(l_id) {

    console.log("getlandlordReviews begin !!!")
    var L_Avg_Rating = 0;
    var L_Approval_Rate = 0;
    var LR_Repair_Requests = 0;
    var L_Response_Rate = 0;
    var L_Recommended_Rate = 0;
    const L_ReviewsParams = {
        TableName: 'Landlord_Reviews',
        FilterExpression: "LP_L_ID = :l_ID",
        ExpressionAttributeValues: {
            ":l_ID": l_id
        }
    };

    try {
        var Review = await dynamoDbLib.call("scan", L_ReviewsParams);

        var l_recommended = 0, l_approval = 0;
        var ReviewResponseList = [];

        //Compute AVG
        if (Review.Count > 0) {

            console.log("compute step");

            for (let item of Review.Items) {

                console.log("compute step2 ", item);
                //het the value of each reviw
                l_recommended = item.LR_Recommend;


                //Convert the value of YES OR NO
                l_recommended = l_recommended == 'yes' ? 1 : 0;

                console.log("compute step3 ", l_recommended);
                //YES oR NO

                L_Recommended_Rate = L_Recommended_Rate + l_recommended;
                console.log("compute step4 ", L_Approval_Rate);
                //Computation
                L_Response_Rate = L_Response_Rate + item.LR_Responsiveness;
                L_Avg_Rating = L_Avg_Rating + item.LR_Rating;
                LR_Repair_Requests = LR_Repair_Requests + item.LR_Repair_Requests;
                console.log("compute step5 ", L_Avg_Rating);

                // in order to get the city and state
                var Tenant;
                console.log(item.LR_T_ID);
                if (item.LR_T_ID != null) {
                    var TenantParams = {
                        TableName: 'Tenant',
                        KeyConditionExpression: "T_ID = :t_id",
                        ExpressionAttributeValues: {
                            ":t_id": item.LR_T_ID
                        }
                    };
                    Tenant = await dynamoDbLib.call("query", TenantParams);
                    console.log("Tenent Data ", Tenant);
                }
                //prepare review Response
                //console.log(item);
                var ReviewResponse = {
                    'LR_Title': item.LR_Title != null ? item.LR_Title : '',
                    'LR_Types': item.LR_Types != null ? item.LR_Types : '',
                    'LR_Created_Date': item.LR_Created_On != null ? item.LR_Created_On : '',
                    'LR_Rating': item.LR_Rating != null ? item.LR_Created_On : '',
                    'LR_Responsiveness': item.LR_Responsiveness,
                    'LR_Repair_Requests': item.LR_Repair_Requests,
                    'LR_Approval': item.LR_Approval,
                    'T_City': Tenant.Count > 0 ? Tenant.Items[0].T_City : ' ',
                    'T_State': Tenant.Count > 0 ? Tenant.Items[0].T_State : ' '
                };

                console.log(ReviewResponse);
                ReviewResponseList = ReviewResponseList.concat(ReviewResponse);
            }
            console.log("done loop");

            var v_reponse = new Object();

            v_reponse.Landlord_Reviews = ReviewResponseList.length > 0 ? ReviewResponseList : [];
            console.log(v_reponse.Landlord_Reviews);
            v_reponse.L_Response_Rate = isNaN(L_Response_Rate / Review.Count) ? 0 : L_Response_Rate / Review.Count;
            v_reponse.L_Avg_Rating = isNaN(L_Avg_Rating / Review.Count) ? 0 : L_Avg_Rating / Review.Count;
            v_reponse.L_Approval_Rate = isNaN(L_Recommended_Rate / Review.Count) ? 0 : L_Recommended_Rate / Review.Count;
            v_reponse.LR_Repair_Requests = isNaN(LR_Repair_Requests / Review.Count) ? 0 : LR_Repair_Requests / Review.Count;
            // set the avg variable
            console.log(v_reponse);
        }
        console.log("getlandlordReviews ended successfully !!!")
        return v_reponse;
    }
    catch (err) {
        console.log(err);
        return err;
    }
}

async function getcomplaints(p_address) {

    console.log("getcomplaintsObj begin!!!! ");
    console.log(p_address);
    var csd = new AWS.CloudSearchDomain({
        endpoint: 'search-complaints-fpo6pfj3dowxfbboyfllktyb4q.us-east-1.cloudsearch.amazonaws.com',
        apiVersion: '2013-01-01'
    });
    var params = {
        query: p_address,
        queryOptions: "{'fields':['c_address_line1'],'defaultOperator':'or'}"
    };
    var listOfObject = [];
    try {
        var data = await csd.search(params).promise();
        console.log(data);
        var i = 0;

        while (i < data.hits.hit.length) {
            var obj = JSON.parse(JSON.stringify(data.hits.hit[i].fields).replace(/[\[\]']+/g, ''));
            listOfObject.push(obj);
            i++;
        }
      //  console.log(listOfObject);

        //to get unique value
        var uniques = _.map(_.groupBy(listOfObject, function (doc) {
            return doc.c_id;
        }), function (grouped) {
            return grouped[0];
        });

        var p_complaints = [];
        for (let comp of uniques) {
            console.log("inside uniques for loop " ,p_address);
            console.log("are they similer",comp.c_address_line1.trim());
            var similarityPercentage = await similarity.checksimilarity(p_address, comp.c_address_line1.trim())

            if (similarityPercentage > 0.6)
                p_complaints.push({ "C_ID": comp.c_id
                // ,"C_add": comp.c_address_line1
                 //,"similarityPercentage":similarityPercentage 
                });

        }

        p_result.Items[0].P_Complaints = p_complaints;



        console.log("getcomplaintsObj ended successfully!!!! ");
    }
    catch (err) {
        console.log(err, err.stack); // an error occurred
        return err;
    }
}

async function getRental(pr_id) {
    console.log("getRental begin !!!!")
    const P_Rental_Param = {
        TableName: 'rv_rental',
        FilterExpression: "PR_ID = :PR_ID",
        ExpressionAttributeValues: {
            ":PR_ID": pr_id
        }
    };

    try {

        var Rental = await dynamoDbLib.call("scan", P_Rental_Param);
        let rentals = [];

        if (Rental.Count > 0) {

            for (let r of Rental.Items) {
                rentals.push({ "R_ID": r.R_ID, "R_End_Date": r.R_End_Date, "R_Price": r.R_Price })
            }
        }
        console.log("getRental ended successfully !!!!")
        return rentals;
    }

    catch (err) {
        console.log(err);
        return err;
    }
}
