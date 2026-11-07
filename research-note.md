# Good agentic development needs evidence loops, not more autonomy

Agentic software development is often described as a contest to give an AI more freedom: a longer task, more tools, a larger terminal session, then less human involvement. I take the opposite position. Good agentic development is not measured by how independently an agent appears to work. It is the design of an evidence loop in which a human remains responsible for the problem, the agent's changes are constrained by explicit rules, and important claims can be checked outside the agent's own account of success.

Autonomy can be useful. An agent can search a repository, connect a failing test to a small patch, or carry out repetitive checks faster than a person working alone. But these gains do not remove the central question: who decides what counts as correct? Anthropic distinguishes a workflow, in which models and tools follow predefined code paths, from an agent that dynamically directs its own process and tool use, and recommends finding the simplest solution possible, increasing complexity only when needed, rather than treating autonomy as an end in itself [Anthropic, 2024]. That is a practical engineering point, but also an accountability point. When the desired outcome is uncertain or value-laden, a more autonomous process can hide the decision rather than solve it.

Software benchmarks make this limitation visible. SWE-bench was built from 2,294 problems drawn from real GitHub issues across 12 popular Python repositories, precisely because a real fix can require coordinating changes across functions, classes and files [Jimenez et al., 2023]. A patch that satisfies an available test suite is useful evidence, but it is not complete evidence that the product behaviour, user-facing language, data handling or deployment decision is right. An agent can optimise for the checks it can see. The developer must decide whether those checks represent the promise being made.

This is why human oversight should be designed into the work rather than added as a final approval button. Amershi et al. argue that human–AI interaction needs clear expectations, feedback and correction mechanisms [Amershi et al., 2019]. In software development, those mechanisms are concrete: define the product's non-negotiable promises before implementation; keep policy and terminology in repository rules; turn testable promises into executable specifications; review diffs rather than only summaries; and treat a failing check as information about the definition of done. These practices make it possible to challenge an agent's output with evidence instead of relying on confidence or fluent explanation.

The NIST AI Risk Management Framework offers a complementary view. Its govern, map, measure and manage functions describe risk work as continuous rather than a one-time compliance stage [NIST, 2023]. Applied to agentic development, this means that risk changes as an agent gains access to code, databases, deployment credentials or public communication. A local test can safely explore a change; a production deployment has different consequences. The appropriate response is not to prohibit agents, but to create boundaries: throwaway test data, narrow commits, explicit permission for external writes, and a record of why a decision changed.

There is a reasonable counter-argument. Requiring reviews, small commits and evidence can slow work down, while autonomous agents can explore alternatives and complete routine implementation efficiently. That is true for bounded tasks with a clear specification. The mistake is to generalise from those tasks to the whole development process. Speed is valuable only when the team can still tell what changed, why it changed, and what remains uncertain. A fast but unverifiable result is especially risky when it affects people, persistent data or a public deployment.

My position, then, is not that humans should manually write every line of code. It is that the human role should move toward deciding the purpose, the constraints and the acceptable evidence, while agents do bounded implementation and investigation. Good agentic development leaves an inspectable trail: the claim, the rule, the test, the revision and the remaining limitation. That trail is not bureaucracy around the real work. It is what makes the work reviewable, corrigible and trustworthy.

## References

### Scholarly

- Amershi, S., Weld, D., Vorvoreanu, M., et al. (2019). [Guidelines for Human-AI Interaction](https://doi.org/10.1145/3290605.3300233). In *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems* (pp. 1–13). ACM.
- Jimenez, C. E., Yang, J., Wettig, A., et al. (2023). [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) arXiv:2310.06770; published at ICLR 2024.

### Practitioner and standards

- Anthropic. (2024, December 19). [Building effective agents](https://www.anthropic.com/research/building-effective-agents). Anthropic Engineering.
- National Institute of Standards and Technology. (2023). [Artificial Intelligence Risk Management Framework (AI RMF 1.0)](https://doi.org/10.6028/NIST.AI.100-1) (NIST AI 100-1). U.S. Department of Commerce.
