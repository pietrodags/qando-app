@smoke
Feature: The service is up
  As the owner, I want one command that checks a running version,
  so that I know the web, the API and the database work together after a deploy.

  Scenario: The web reaches the API and the database
    When I ask the web how the service is
    Then it answers that the API and the database are up

  Scenario: The home page opens the creation wizard
    When I open the home page
    Then I am on step 1

  Scenario: The home page names its icon, qando's symbol as a picture search engines take
    When I open the home page
    Then the page names one icon, a PNG of 192 px

  Scenario: An unknown address shows the not-found page
    When I open "/no-existe"
    Then I see the heading "Página no encontrada"
    And the tab title is "Página no encontrada | qando"

  Scenario Outline: The web forwards the connector's discovery address <address> to the API
    When I ask the web for "<address>"
    Then the API answers <answer>

    Examples:
      | address                                          | answer                                   |
      | /.well-known/oauth-protected-resource            | with the connector's metadata            |
      | /.well-known/oauth-protected-resource/api/mcp    | with the connector's metadata            |
      | /.well-known/oauth-authorization-server/api/auth | with the authorization server's metadata |
      | /.well-known/oauth-authorization-server          | that it does not know that address       |

  Scenario: The web forwards the connector's refusal of a call without access, saying where to ask for it
    When an assistant calls the connector without a token
    Then it answers 401 with the address of the connector's metadata and every permission to ask for
