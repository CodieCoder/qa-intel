Feature: V1 compatibility

@smoke @api
Scenario: Representative browser and API contract
  Given I navigate to "/login"
  When I type "maac@example.com" into the field "Email"
  And I click the button "Log in"
  And I GET "/api/session"
  Then I should see the heading "Dashboard"
  And the url should contain "/dashboard"
  And the API response to "/api/session" should have status 200
  And the response header "content-type" from "/api/session" should contain "application/json"
  And requests to "/api/session" should include trace ID
