import * as dynamoDbLib from "../../libs/dynamodb-lib";
import { success, failure } from "../../libs/response-lib";

export async function getlandlordByName(event, context, callback) {

  const params = {
    TableName: 'rv_landlord',
    FilterExpression: "contains(L_Full_Name,:Fname)",
    ExpressionAttributeValues: {
      ":Fname": event.pathParameters.Fname.toUpperCase()
    },
    Limit: 1000,
  };
  try {
    const result = await dynamoDbLib.call("scan", params);

    var resultList = [];
    for (let item of result.Items) {
      var object = {
        L_ID: item.L_ID,
        L_Full_Name: item.L_Full_Name
      }
      resultList.push(object)
    }

    callback(null, success(resultList));
  } catch (e) {
    callback(null, failure(e));
  }
}

export async function getlandlordInfo(event, context, callback) {

  var L_Avg_Rating = 0;
  var L_Approval_Rate = 0;
  var LR_Repair_Requests = 0;
  var L_Response_Rate = 0;
  var L_Recommended_Rate = 0
  // console.log(event.pathParameters.l_id) ;
  const params = {
    TableName: 'rv_landlord',
    KeyConditionExpression: "L_ID = :l_id",
    ExpressionAttributeValues: {
      ":l_id": event.pathParameters.l_id
    }
  };
  const L_ReviewsParams = {
    TableName: 'Landlord_Reviews',
    FilterExpression: "LP_L_ID = :l_ID",
    ExpressionAttributeValues: {
      ":l_ID": event.pathParameters.l_id
    }
  };

  try {

    //get landlord data
    var result = await dynamoDbLib.call("query", params);
    //console.log("First Step ", result);


    // get review for landlord 

    var Review = await dynamoDbLib.call("scan", L_ReviewsParams);
    console.log("second Step ", Review);



    console.log(result.Items[0]);

    var l_recommended = 0, l_approval = 0;
    var ReviewResponseList = [];
    console.log(" ReviewResponseList = [];", ReviewResponseList);
    //Compute AVG 
    if (Review.Count > 0) {
      console.log("compute step");

      for (let item of Review.Items) {

        console.log("compute step2 ",item);
        //het the value of each reviw 
        l_recommended = item.LR_Recommend;
        l_approval = item.LR_Approval;

        //Convert the value of YES OR NO
        l_recommended = l_recommended == 'yes' ? 1 : 0;
        l_approval = l_approval == 'yes' ? 1 : 0;
        console.log("compute step3 ",l_recommended);
        //YES oR NO
        L_Approval_Rate = L_Approval_Rate + l_approval;
        L_Recommended_Rate = L_Recommended_Rate + l_recommended;
        console.log("compute step4 ",L_Approval_Rate);
        //Computation 
        L_Response_Rate = L_Response_Rate + item.LR_Responsiveness;
        L_Avg_Rating = L_Avg_Rating + item.LR_Rating;
        LR_Repair_Requests = LR_Repair_Requests + item.LR_Repair_Requests;
        console.log("compute step5 ",L_Avg_Rating);

        // in order to get the city and state 
        var Tenant;
        if (item.T_ID != null) {
          var TenantParams = {
            TableName: 'Tenant',
            FilterExpression: "T_ID = :t_id",
            ExpressionAttributeValues: {
              ":t_id": item.T_ID
            }
          };
          Tenant = await dynamoDbLib.call("scan", TenantParams);
          console.log("Tenent Data ", Tenant);
        }
        //prepare review Response
        var ReviewResponse = {
          'LR_Title': item.LR_Title,
          'LR_Types': item.LR_Types,
          'LR_Created_Date': item.LR_Created_Date,
          'LR_Rating': item.LR_Rating,
          'LR_Responsiveness': item.LR_Responsiveness,
          'LR_Repair_Requests': item.LR_Repair_Requests,
          'LR_Approval': item.LR_Approval,
          'T_City': Tenant != null ? Tenant.Items[0].T_City : ' ',
          'T_State': Tenant != null ? Tenant.Items[0].T_State : ' '
        };
        ReviewResponseList = ReviewResponseList.concat(ReviewResponse);
      }
    }
    console.log("after IF ", ReviewResponseList);
    result.Items[0].Landlord_Reviews = Review.Count > 0 ? ReviewResponseList : [];



    // set the avg variable
    result.Items[0].L_Response_Rate = isNaN(L_Response_Rate / Review.Count) ? 0 : L_Response_Rate / Review.Count;
    result.Items[0].L_Avg_Rating = isNaN(L_Avg_Rating / Review.Count) ? 0 : L_Avg_Rating / Review.Count;
    result.Items[0].L_Approval_Rate = isNaN(l_approval / Review.Count) ? 0 : l_approval / Review.Count;
    result.Items[0].LR_Repair_Requests = isNaN(LR_Repair_Requests / Review.Count) ? 0 : LR_Repair_Requests / Review.Count;

    console.log(result.Items[0]);
    console.log("done from reviews");


    var L_Properties = [];
    //If this landlord has property 
    console.log(result.Items[0].L_Properties);
    var propertysize = result.Items[0].L_Properties.length;
    if ( propertysize > 0) {
      console.log("inside the loop");
      
      for (let prop of result.Items[0].L_Properties) {

        var L_PropertiesParams = {
          TableName: 'rv_property',
          FilterExpression: "P_ID = :p_id",
          ExpressionAttributeValues: {
            ":p_id": prop.p_id.toString()
          }
        };
        var properties = await dynamoDbLib.call("scan", L_PropertiesParams);

        console.log("GET property data ", properties);


        // do we have data for this properties ? ? 
        if (properties.Count > 0) {
          
          // get property review param from table
          var PropertiesReviewParams = {
            TableName: 'Property_Reviews',
            FilterExpression: "P_ID = :p_id",
            ExpressionAttributeValues: {
              ":p_id": properties.Items[0].P_ID
            }
          };
          console.log("we have data propertiesReview ");

          var propertiesReview = await dynamoDbLib.call("scan", PropertiesReviewParams);
         
          var sum_prop_avg = 0
          if (propertiesReview.Count > 0 ) {
            console.log("we have data  propertiesReview",propertiesReview.Items);

            //compute the avg rating for property 
           var p_review_count = 0;
           while(propertiesReview.Count >p_review_count )
            {
              console.log("inside loop", propertiesReview.Items);
              sum_prop_avg = propertiesReview.Items[p_review_count].LR_Rating + sum_prop_avg;
              p_review_count++;
            }

            console.log("compute the avg ", sum_prop_avg / propertiesReview.Count);
          }


          // prepare property response 
          var propResponse = {
            'P_ID': properties.Items[0].P_ID,
            'P_Photos': properties.Items[0].P_Photos,
            'P_Address_Line1': properties.Items[0].P_Address_Line2,
            'P_Address_Line2': properties.Items[0].P_Address_Line2,
            'P_City': properties.Items[0].P_City,
            'P_Zipcode': properties.Items[0].P_Zipcode,
            'P_State': properties.Items[0].P_State,
            'PR_Rating': propertiesReview.Count> 0  ?  sum_prop_avg / propertiesReview.Count : 0 ,
            'PR_Count': propertiesReview.Count> 0 ?  propertiesReview.Count  : 0
          };
          console.log("propResponse", propResponse);

          L_Properties = L_Properties.concat(propResponse);
         
        }
      }
      result.Items[0].L_Properties = propertysize > 0 ? L_Properties : [];


      //console.log(result);
    }
 
    callback(null, success(result));
  } catch (e) {
    callback(null, failure(e));
  }
}


export async function getlandlordByaddress(event, context, callback) {


  var search_val =decodeURI(event.pathParameters.address);
  const params = {
    TableName: 'rv_property',
    FilterExpression: "contains(P_Address_Line1,:address)",
    ExpressionAttributeValues: {
      ":address": search_val
    }
  };
  try {
    const result = await dynamoDbLib.call("scan", params);

    var landlordResponseList = [] ;
    for (let item of result.Items) {

      const landlordparams = {
        TableName: 'rv_landlord',
        FilterExpression: "contains(L_Properties, :L_Properties)",
        ExpressionAttributeValues: {
          ":L_Properties": {
             'p_id':parseInt(item.P_ID,10)
          }
        }

      };
      
          
      var landlord =await dynamoDbLib.call("scan", landlordparams);
      var size = 0 ; 
      if(landlord.Count > 0)
      {
        console.log("We have data", landlord);
         while (landlord.Count > size)
         {
           
           var landlordResponse = {
             'L_ID' : landlord.Items[size].L_ID ,
             'L_Full_Name': landlord.Items[size].L_Full_Name
           }
           landlordResponseList = landlordResponseList.concat(landlordResponse);
           console.log(landlordResponseList)
             size++;
         }
      }
    
    }
    callback(null, success(landlordResponseList));
  } catch (e) {
    callback(null, failure(e));
  }


}
